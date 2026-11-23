import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API !== "0";
const userId = "usr_local_dev";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", "x-user-id": userId, ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function pollApproval(taskId: string) {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const a = await api(`/v1/approvals?taskId=${taskId}&status=pending`);
    const approval = a.json?.approvals?.[0];
    if (approval) return approval;
  }
  return null;
}

(run ? describe : describe.skip)("Browser navigate guard API", () => {
  it("enforces allowlist and guarded approval flow", async () => {
    const createTask = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "Navigate smoke test", kind: "browser" }) });
    expect(createTask.status).toBe(201);
    const taskId = createTask.json.task.id as string;

    const createSession = await api("/v1/browser/sessions", { method: "POST", body: JSON.stringify({ taskId, provider: "playwright", headless: true, initialUrl: "https://example.com" }) });
    expect([200,201]).toContain(createSession.status);
    const sessionId = createSession.json?.session?.id;
    expect(sessionId).toBeTruthy();

    const allowed = await api(`/v1/browser/sessions/${sessionId}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://example.com/" }) });
    expect(allowed.status).toBe(200);

    const blocked = await api(`/v1/browser/sessions/${sessionId}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://evil.example/" }) });
    expect(blocked.status).toBe(403);

    const createApprovalTask = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "buy something now", kind: "browser" }) });
    expect(createApprovalTask.status).toBe(201);
    const approvalTaskId = createApprovalTask.json.task.id as string;
    const approval = await pollApproval(approvalTaskId);
    expect(approval?.actionHash).toBeTruthy();

    const resolve = await api(`/v1/approvals/${approval.id}/resolve`, { method: "POST", body: JSON.stringify({ decision: "approve", actionHash: approval.actionHash }) });
    expect(resolve.status).toBe(200);

    const createGuardedSession = await api("/v1/browser/sessions", { method: "POST", body: JSON.stringify({ taskId: approvalTaskId, provider: "playwright", headless: true, initialUrl: "https://example.com" }) });
    expect([200,201]).toContain(createGuardedSession.status);
    const guardedSessionId = createGuardedSession.json?.session?.id;
    expect(guardedSessionId).toBeTruthy();

    const idempotencyKey = `itest:${approval.actionHash}`;
    const guarded = await api(`/v1/browser/sessions/${guardedSessionId}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://example.com/", approvalId: approval.id, actionHash: approval.actionHash, idempotencyKey }) });
    expect(guarded.status).toBe(200);
    expect(guarded.json?.ok).toBe(true);

    const deduped = await api(`/v1/browser/sessions/${guardedSessionId}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://example.com/", approvalId: approval.id, actionHash: approval.actionHash, idempotencyKey }) });
    expect(deduped.status).toBe(200);
    expect(deduped.json?.deduped).toBe(true);
  }, 90000);
});
