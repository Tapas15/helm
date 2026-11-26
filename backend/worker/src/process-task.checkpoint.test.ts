import { describe, expect, it } from "vitest";
import { actionReceipts, approvals, auditLog, feedbackEvents, taskEvents } from "@helm/db";
import { processTask } from "./index.js";

function makeDb(opts?: { checkpoint?: any; approvals?: any[]; receipts?: any[] }) {
  const insertedEvents: any[] = [];
  const insertedApprovals: any[] = [];
  const insertedAudit: any[] = [];
  const feedbackRows: any[] = [];
  const task: any = { id: "tsk_1", userId: "u1", status: "queued", prompt: "buy a domain", kind: "assistant", state: {}, checkpoint: opts?.checkpoint ?? null, startedAt: new Date(), createdAt: new Date() };
  const approvalsRows = opts?.approvals ?? [];
  const receiptRows = opts?.receipts ?? [];

  const selectChain = (table: unknown) => {
    let rows: any[] = [];
    if (table === approvals) rows = approvalsRows;
    if (table === actionReceipts) rows = receiptRows;
    if (table === taskEvents) rows = [];
    const c: any = Promise.resolve(rows);
    c.where = () => c;
    c.orderBy = () => c;
    c.limit = async () => rows;
    return c;
  };

  const db: any = {
    insertedEvents, insertedApprovals, insertedAudit, feedbackRows,
    select: () => ({ from: (table: unknown) => selectChain(table) }),
    insert: (table: unknown) => ({
      values: async (v: any) => {
        if (table === taskEvents) insertedEvents.push(v);
        if (table === approvals) { insertedApprovals.push(v); approvalsRows.push(v); }
        if (table === auditLog) insertedAudit.push(v);
        if (table === feedbackEvents) feedbackRows.push(v);
        return { onConflictDoNothing: async () => undefined, returning: async () => [v] };
      },
    }),
    update: () => ({ set: (v: any) => ({ where: async () => { Object.assign(task, v); return [task]; }, returning: async () => { Object.assign(task, v); return [task]; } }) }),
  };
  return { db, task };
}

describe("processTask checkpoint resume/dedupe", () => {
  it("emits runtime.checkpoint.resumed when non-terminal checkpoint exists", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const checkpoint = { version: 1, runId: "run_old", taskId: "tsk_1", lastEventSeq: 2, lastEventType: "runtime.planning", updatedAt: "2026-11-26T00:00:00.000Z", statusHint: "running" };
    const { db, task } = makeDb({ checkpoint });
    const runtime = { run: async function* () { yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } }; } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    expect(db.insertedEvents.some((e: any) => e.type === "runtime.checkpoint.resumed")).toBe(true);
  });

  it("dedupes approval request when same actionHash already pending", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const existing = { id: "apr_existing", taskId: "tsk_1", actionHash: "ah_same", actionKind: "external.high_risk", status: "pending" };
    const { db, task } = makeDb({ approvals: [existing] });
    const runtime = { run: async function* () {
      yield { type: "runtime.tool.proposed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "needs approval", payload: { approvalRequired: true, actionHash: "ah_same", action: "external.high_risk" } };
      yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "waiting", payload: { status: "waiting_approval", output: "wait" } };
    } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    expect(db.insertedApprovals).toHaveLength(0);
    expect(task.status).toBe("waiting_approval");
  });
});
