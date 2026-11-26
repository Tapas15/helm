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
  return { status: res.status, json, text, headers: res.headers };
}

(run ? describe : describe.skip)("Worker lease recovery (real-service proof)", () => {
  it("reclaims an expired leased queued task and reaches terminal state without duplicate terminal events", async () => {
    const prompt = `lease recovery ${Date.now()}`;
    const create = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt, kind: "assistant" }) });
    expect(create.status).toBe(201);
    const taskId = create.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const expired = await api(`/v1/test/tasks/${taskId}/expire-lease`, { method: "POST", body: JSON.stringify({ leaseUntil: new Date(Date.now() - 60_000).toISOString() }) });
    expect(expired.status).toBe(200);
    expect(expired.json?.task?.status).toBe("queued");

    let task: any = null;
    for (let i = 0; i < 90; i++) {
      const got = await api(`/v1/tasks/${taskId}`);
      task = got.json?.task;
      if (task && ["succeeded", "failed", "cancelled", "completed"].includes(String(task.status))) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(task).toBeTruthy();
    expect(["succeeded", "failed", "cancelled", "completed"]).toContain(String(task.status));
    expect(task.leaseOwner ?? null).toBeNull();

    const events = await api(`/v1/tasks/${taskId}/events?after=-1&limit=500`);
    expect(events.status).toBe(200);
    const types = (events.json?.events ?? []).map((e: any) => String(e.type));
    const terminal = types.filter((t: string) => t === "task.completed" || t === "task.failed");
    expect(terminal.length).toBeLessThanOrEqual(1);
    expect(types).toContain("task.lease.expired.seeded");
  }, 180000);
});
