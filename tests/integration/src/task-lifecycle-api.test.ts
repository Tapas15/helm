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

(run ? describe : describe.skip)("Task lifecycle API invariants", () => {
  it("rejects follow-up on cancelled task with INVALID_TRANSITION", async () => {
    const create = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "cancel me", kind: "assistant" }) });
    expect(create.status).toBe(201);
    const taskId = create.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const cancel = await api(`/v1/tasks/${taskId}/control`, { method: "POST", body: JSON.stringify({ action: "cancel" }) });
    expect(cancel.status).toBe(200);
    expect(cancel.json?.task?.status).toBe("cancelled");

    const followup = await api(`/v1/tasks/${taskId}/messages`, { method: "POST", body: JSON.stringify({ content: "should not revive" }) });
    expect(followup.status).toBe(409);
    expect(followup.json?.error?.code).toBe("INVALID_TRANSITION");

    const after = await api(`/v1/tasks/${taskId}`);
    expect(after.status).toBe(200);
    expect(after.json?.task?.status).toBe("cancelled");

    const msgs = await api(`/v1/tasks/${taskId}/messages`);
    expect(msgs.status).toBe(200);
    const contents = (msgs.json?.messages ?? []).map((m: any) => m.content);
    expect(contents).not.toContain("should not revive");
  }, 30000);

  it("persists idempotencyKey in initial task message metadata when provided", async () => {
    const idem = `idem_test_${crypto.randomUUID().replace(/-/g, "")}`;
    const create = await api("/v1/tasks", {
      method: "POST",
      headers: { "idempotency-key": idem },
      body: JSON.stringify({ prompt: "idempotency metadata test", kind: "assistant" }),
    });
    expect(create.status).toBe(201);
    const taskId = create.json?.task?.id as string;
    expect(taskId).toBeTruthy();

    const msgs = await api(`/v1/tasks/${taskId}/messages`);
    expect(msgs.status).toBe(200);
    const messages = msgs.json?.messages ?? [];
    expect(messages.length).toBeGreaterThan(0);
    const first = messages[0];
    expect(first.role).toBe("user");
    expect(first.metadata?.idempotencyKey).toBe(idem);

    const replay = await api("/v1/tasks", {
      method: "POST",
      headers: { "idempotency-key": idem },
      body: JSON.stringify({ prompt: "idempotency metadata test", kind: "assistant" }),
    });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(replay.json?.task?.id).toBe(taskId);
  }, 30000);
});
