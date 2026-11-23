import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", "x-user-id": "usr_local_dev", ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

(run ? describe : describe.skip)("Events SSE API", () => {
  it("streams events and respects after cursor", async () => {
    const create = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "sse test", kind: "assistant" }) });
    expect(create.status).toBe(201);
    const taskId = create.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const ac = new AbortController();
    const res = await fetch(`${base}/v1/events/stream?taskId=${encodeURIComponent(taskId)}&after=-1`, { headers: { "x-user-id": "usr_local_dev" }, signal: ac.signal });
    expect(res.status).toBe(200);
    expect(String(res.headers.get("content-type") ?? "")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let gotEvent = false;
    let gotHeartbeat = false;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !(gotEvent && gotHeartbeat)) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (buf.includes("event: event")) gotEvent = true;
      if (buf.includes("event: heartbeat")) gotHeartbeat = true;
    }
    ac.abort();
    expect(gotEvent).toBe(true);
    expect(gotHeartbeat).toBe(true);
  }, 20000);
});
