import { describe, expect, it } from "vitest";

const base = process.env.HELM_API_URL ?? "http://127.0.0.1:8787";
const run = process.env.HELM_INTEGRATION_API === "1";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", "x-user-id": "usr_local_dev", ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(run ? describe : describe.skip)("Approval resolve API invariants", () => {
  it("returns 403 on actionHash mismatch and dedupes/conflicts on replay", async () => {
    const create = await api("/v1/tasks", { method: "POST", body: JSON.stringify({ prompt: "buy something now", kind: "browser" }) });
    expect(create.status).toBe(201);
    const taskId = create.json.task.id as string;

    let approval: any = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 500));
      const a = await api(`/v1/approvals?taskId=${taskId}&status=pending`);
      approval = a.json?.approvals?.[0];
      if (approval) break;
    }
    expect(approval?.id).toBeTruthy();

    const mismatch = await api(`/v1/approvals/${approval.id}/resolve`, { method: "POST", body: JSON.stringify({ decision: "approve", actionHash: "wrong" }) });
    expect(mismatch.status).toBe(403);

    const approve = await api(`/v1/approvals/${approval.id}/resolve`, { method: "POST", body: JSON.stringify({ decision: "approve", actionHash: approval.actionHash }) });
    expect(approve.status).toBe(200);
    expect(approve.json.approval.status).toBe("approved");

    const replay = await api(`/v1/approvals/${approval.id}/resolve`, { method: "POST", body: JSON.stringify({ decision: "approve", actionHash: approval.actionHash }) });
    expect(replay.status).toBe(200);
    expect(replay.json.deduped).toBe(true);

    const conflict = await api(`/v1/approvals/${approval.id}/resolve`, { method: "POST", body: JSON.stringify({ decision: "reject", actionHash: approval.actionHash }) });
    expect(conflict.status).toBe(409);
  }, 60000);
});
