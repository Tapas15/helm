import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-user-id": "usr_local_dev", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function readSSE(url: string, headers: Record<string, string>, stop: (buf: string) => boolean, timeoutMs = 8000) {
  const ac = new AbortController();
  const res = await fetch(url, { headers, signal: ac.signal });
  expect(res.status).toBe(200);
  expect(String(res.headers.get("content-type") ?? "")).toContain("text/event-stream");
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline && !stop(buf)) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
  } finally {
    ac.abort();
    try { await reader.cancel(); } catch {}
  }
  return buf;
}

(run ? describe : describe.skip)("Events SSE API", () => {
  it("streams events and heartbeat", async () => {
    const create = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "sse test", kind: "assistant" }) });
    expect(create.status).toBe(201);
    const taskId = create.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const buf = await readSSE(
      `${base}/v1/events/stream?taskId=${encodeURIComponent(taskId)}&after=-1`,
      { "x-user-id": "usr_local_dev" },
      (b) => b.includes("event: event") && b.includes("event: heartbeat"),
    );
    expect(buf).toContain("event: event");
    expect(buf).toContain("event: heartbeat");
  }, 20000);

  it("respects after cursor and only streams newer events", async () => {
    const create = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "sse cursor test", kind: "assistant" }) });
    expect(create.status).toBe(201);
    const taskId = create.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const initial = await api(`/v1/tasks/${encodeURIComponent(taskId)}/events?after=-1&limit=200`);
    expect(initial.status).toBe(200);
    const events = (initial.json?.events ?? []) as Array<{ sequence: number; type: string }>;
    expect(events.length).toBeGreaterThan(0);
    const maxSeq = Math.max(...events.map((e) => Number(e.sequence)));

    const followUp = await api(`/v1/tasks/${encodeURIComponent(taskId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: "follow up for sse cursor" }),
    });
    expect(followUp.status).toBe(200);

    const buf = await readSSE(
      `${base}/v1/events/stream?taskId=${encodeURIComponent(taskId)}&after=${maxSeq}`,
      { "x-user-id": "usr_local_dev" },
      (b) => b.includes("task.followup") && b.includes("event: heartbeat"),
      12000,
    );
    expect(buf).toContain("task.followup");
    expect(buf).not.toContain('"type":"task.created"');

    const idMatches = Array.from(buf.matchAll(/^id: (\d+)$/gm)).map((m) => Number(m[1]));
    for (const id of idMatches) expect(id).toBeGreaterThan(maxSeq);
  }, 30000);
});
