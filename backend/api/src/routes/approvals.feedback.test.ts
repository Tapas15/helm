import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, auditLog, feedbackEvents, taskEvents, tasks } from "@helm/db";
import { approvalRoutes } from "./approvals.js";

const env = { ...process.env };

function makeDb() {
  const feedbackRows: any[] = [];
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", actionKind: "gmail.send", actionHash: "hash_1", status: "pending" };
  const task = { id: "tsk_1", userId: "u1", status: "waiting_approval", completedAt: null };
  const db = {
    feedbackRows,
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === approvals ? [approval] : table === tasks ? [task] : table === taskEvents ? [] : [], orderBy: () => ({ limit: async () => [] }) }) }) }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => { Object.assign(approval, v); return [approval]; } }) }) }),
    insert: (table: unknown) => ({ values: (v: any) => { if (table === feedbackEvents) feedbackRows.push(v); return { onConflictDoNothing: () => Promise.resolve(), returning: async () => [v] }; } }),
  } as any;
  return db;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/approvals", approvalRoutes(db));
  return app;
}

describe("approvals feedback emission (P7a)", () => {
  beforeEach(() => { process.env = { ...env, HELM_FEEDBACK_ENABLED: "1" }; });
  afterEach(() => { process.env = { ...env }; });

  it("emits redacted approval_decision feedback on reject", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/approvals/apr_1/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "reject", reason: "no", actionHash: "hash_1" }) });
    expect(res.status).toBe(200);
    const row = db.feedbackRows.find((r: any) => r.kind === "approval_decision");
    expect(row).toBeTruthy();
    expect(row.signal).toBe("negative");
    expect(row.payload?.summary).toBe("approval.rejected");
    expect(row.payload?.actionHash).toBe("hash_1");
    expect(row.redacted).toBe(true);
  });

  it("emits redacted approval_decision feedback on approve", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/approvals/apr_1/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "approve", actionHash: "hash_1", idempotencyKey: "idem_1" }) });
    expect(res.status).toBe(200);
    const row = db.feedbackRows.find((r: any) => r.kind === "approval_decision");
    expect(row).toBeTruthy();
    expect(row.signal).toBe("positive");
    expect(row.severity).toBe("info");
    expect(row.payload?.summary).toBe("approval.approved");
    expect(row.payload?.actionHash).toBe("hash_1");
    expect(row.payload?.approvalId).toBe("apr_1");
    expect(row.redacted).toBe(true);
  });
});
