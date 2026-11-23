import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";
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
    if (a.json?.approvals?.[0]) return a.json.approvals[0];
  }
  return null;
}

(run ? describe : describe.skip)("Guarded browser action ownership binding", () => {
  it("rejects guarded navigate when approval task does not match session task", async () => {
    const taskA = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "Navigate smoke test", kind: "browser" }) });
    const taskB = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "buy something now", kind: "browser" }) });
    expect(taskA.status).toBe(201); expect(taskB.status).toBe(201);
    const sessionA = await api("/v1/browser/sessions", { method: "POST", body: JSON.stringify({ taskId: taskA.json.task.id, provider: "playwright", headless: true, initialUrl: "https://example.com" }) });
    expect([200,201]).toContain(sessionA.status);
    const approval = await pollApproval(taskB.json.task.id);
    expect(approval?.id).toBeTruthy();
    const resolve = await api(`/v1/approvals/${approval.id}/resolve`, { method: "POST", body: JSON.stringify({ decision: "approve", actionHash: approval.actionHash }) });
    expect(resolve.status).toBe(200);
    const res = await api(`/v1/browser/sessions/${sessionA.json.session.id}/navigate`, { method: "POST", body: JSON.stringify({ url: "https://example.com/", approvalId: approval.id, actionHash: approval.actionHash, idempotencyKey: `mismatch:${approval.actionHash}` }) });
    expect(res.status).toBe(403);
  }, 90000);
});
