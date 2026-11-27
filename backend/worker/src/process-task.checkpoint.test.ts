import { describe, expect, it } from "vitest";
import { actionReceipts, approvals, auditLog, feedbackEvents, taskEvents, tasks } from "@helm/db";
import { processTask } from "./index.js";

function makeDb(opts?: { checkpoint?: any; approvals?: any[]; receipts?: any[]; taskStatus?: string }) {
  const insertedEvents: any[] = [];
  const insertedApprovals: any[] = [];
  const insertedAudit: any[] = [];
  const feedbackRows: any[] = [];
  const insertedReceipts: any[] = [];
  const task: any = { id: "tsk_1", userId: "u1", status: opts?.taskStatus ?? "queued", prompt: "buy a domain", kind: "assistant", state: {}, checkpoint: opts?.checkpoint ?? null, startedAt: new Date(), createdAt: new Date() };
  const approvalsRows = opts?.approvals ?? [];
  const receiptRows = opts?.receipts ?? [];

  const selectChain = (table: unknown) => {
    let rows: any[] = [];
    if (table === approvals) rows = approvalsRows;
    if (table === actionReceipts) rows = receiptRows;
    if (table === taskEvents) rows = [];
    if (table === tasks) rows = [task];
    const c: any = Promise.resolve(rows);
    c.where = () => c;
    c.orderBy = () => c;
    c.limit = async () => rows;
    return c;
  };

  const updateChain = (v: any) => {
    const apply = () => { Object.assign(task, v); return [task]; };
    const whereObj: any = {
      returning: async () => apply(),
      then: (resolve: any, reject: any) => Promise.resolve(apply()).then(resolve, reject),
    };
    return { where: () => whereObj };
  };

  const db: any = {
    insertedEvents, insertedApprovals, insertedAudit, feedbackRows, insertedReceipts,
    select: () => ({ from: (table: unknown) => selectChain(table) }),
    insert: (table: unknown) => ({
      values: async (v: any) => {
        if (table === taskEvents) insertedEvents.push(v);
        if (table === approvals) { insertedApprovals.push(v); approvalsRows.push(v); }
        if (table === auditLog) insertedAudit.push(v);
        if (table === feedbackEvents) feedbackRows.push(v);
        if (table === actionReceipts) { insertedReceipts.push(v); receiptRows.push(v); }
        return { onConflictDoNothing: async () => undefined, returning: async () => [v] };
      },
    }),
    update: () => ({ set: (v: any) => updateChain(v) }),
  };
  return { db, task };
}

describe("processTask checkpoint resume/dedupe", () => {
  it("emits runtime.checkpoint.resumed with resumePlan and passes context", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const checkpoint = { version: 1, runId: "run_old", taskId: "tsk_1", lastEventSeq: 2, lastEventType: "runtime.planning", updatedAt: "2026-11-26T00:00:00.000Z", statusHint: "running", resumePlan: { version: 1, lastSafeBoundary: "runtime.planning", completedToolRefs: [{ name: "browser_snapshot", eventSeq: 2 }], completedActionHashes: [] } };
    let seenResumePlan: any = undefined;
    const { db, task } = makeDb({ checkpoint });
    const runtime = { run: async function* (input: any) { seenResumePlan = input?.context?.runtimeResumePlan; yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } }; } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    const resumed = db.insertedEvents.find((e: any) => e.type === "runtime.checkpoint.resumed");
    expect(resumed).toBeTruthy();
    expect(resumed.payload?.resumePlan?.lastSafeBoundary).toBe("runtime.planning");
    const applied = db.insertedEvents.find((e: any) => e.type === "runtime.checkpoint.resume_plan_applied");
    expect(applied?.payload?.completedToolRefs).toBe(1);
    expect(seenResumePlan?.completedToolRefs?.[0]?.name).toBe("browser_snapshot");
    expect(task.status).toBe("succeeded");
  });

  it("passes completedActionHashes in resumePlan for runtime dedupe guardrails", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const checkpoint = { version: 1, runId: "run_old", taskId: "tsk_1", lastEventSeq: 3, lastEventType: "runtime.tool.completed", updatedAt: "2026-11-26T00:00:00.000Z", statusHint: "running", resumePlan: { version: 1, lastSafeBoundary: "runtime.tool.completed", completedToolRefs: [{ name: "browser_click", eventSeq: 3, actionHash: "ah_done", idempotencyKey: "ik_done" }], completedActionHashes: ["ah_done"] } };
    let seenResumePlan: any = undefined;
    const { db, task } = makeDb({ checkpoint });
    const runtime = { run: async function* (input: any) {
      seenResumePlan = input?.context?.runtimeResumePlan;
      yield { type: "runtime.tool.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "Tool browser_click blocked", payload: { name: "browser_click", result: JSON.stringify({ error: "Resume plan indicates actionHash ah_done already completed; refusing duplicate side effect" }), policy: "denied" } };
      yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } };
    } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    expect(seenResumePlan?.completedActionHashes).toContain("ah_done");
    expect(db.insertedReceipts).toHaveLength(0);
    expect(db.insertedApprovals).toHaveLength(0);
    expect(task.status).toBe("succeeded");
  });

  it("passes read-only argsKey resumePlan and records no duplicate side-effect artifacts on deduped read", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const checkpoint = { version: 1, runId: "run_old", taskId: "tsk_1", lastEventSeq: 3, lastEventType: "runtime.tool.completed", updatedAt: "2026-11-26T00:00:00.000Z", statusHint: "running", resumePlan: { version: 1, lastSafeBoundary: "runtime.tool.completed", completedToolRefs: [{ name: "browser_snapshot", eventSeq: 3, argsKey: JSON.stringify({ sessionId: "s1" }) }], completedActionHashes: [] } };
    let seenResumePlan: any = undefined;
    const { db, task } = makeDb({ checkpoint });
    const runtime = { run: async function* (input: any) {
      seenResumePlan = input?.context?.runtimeResumePlan;
      yield { type: "runtime.tool.deduped", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "Tool browser_snapshot deduped by resume plan", payload: { name: "browser_snapshot", argsKey: JSON.stringify({ sessionId: "s1" }), reason: "resume_plan_completed_read_tool" } };
      yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } };
    } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    expect(seenResumePlan?.completedToolRefs?.[0]?.argsKey).toBe(JSON.stringify({ sessionId: "s1" }));
    expect(db.insertedReceipts).toHaveLength(0);
    expect(db.insertedApprovals).toHaveLength(0);
    expect(task.status).toBe("succeeded");
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

  it("resumes pending approval checkpoint without re-running runtime", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const checkpoint = { version: 1, runId: "run_old", taskId: "tsk_1", lastEventSeq: 2, lastEventType: "runtime.approval.requested", updatedAt: "2026-11-26T00:00:00.000Z", statusHint: "waiting_approval", resumePlan: { version: 1, lastSafeBoundary: "runtime.approval.requested", pendingApproval: { actionHash: "ah_same", actionKind: "external.high_risk", approvalId: "apr_existing" }, completedToolRefs: [] } };
    const existing = { id: "apr_existing", taskId: "tsk_1", actionHash: "ah_same", actionKind: "external.high_risk", status: "pending", summary: "needs approval" };
    let ran = false;
    const { db, task } = makeDb({ checkpoint, approvals: [existing] });
    const runtime = { run: async function* () { ran = true; yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } }; } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    expect(ran).toBe(false);
    expect(task.status).toBe("waiting_approval");
  });

  it("emits resume_plan_applied with accurate counts", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const checkpoint = { version: 1, runId: "run_old", taskId: "tsk_1", lastEventSeq: 4, lastEventType: "runtime.tool.completed", updatedAt: "2026-11-26T00:00:00.000Z", statusHint: "running", resumePlan: { version: 1, lastSafeBoundary: "runtime.tool.completed", pendingApproval: { actionHash: "ah_pending", actionKind: "external.high_risk" }, completedToolRefs: [{ name: "browser_snapshot", eventSeq: 2, argsKey: JSON.stringify({ sessionId: "s1" }) }, { name: "browser_click", eventSeq: 3, actionHash: "ah_done", idempotencyKey: "ik1" }], completedActionHashes: ["ah_done"] } };
    const { db, task } = makeDb({ checkpoint, approvals: [{ id: "apr_p", taskId: "tsk_1", actionHash: "ah_pending", actionKind: "external.high_risk", status: "pending", summary: "p" }] });
    const runtime = { run: async function* () { yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } }; } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    const applied = db.insertedEvents.find((e: any) => e.type === "runtime.checkpoint.resume_plan_applied");
    expect(applied?.payload).toMatchObject({ lastSafeBoundary: "runtime.tool.completed", completedToolRefs: 2, completedActionHashes: 1, pendingApproval: "ah_pending" });
  });

  it("does not overwrite paused task and requests runtime interrupt when paused during runtime", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const { db, task } = makeDb();
    let flipped = false;
    let interruptedRunId: string | null = null;
    const runtime = {
      interrupt: async (runId: string) => { interruptedRunId = runId; },
      run: async function* (input: any) {
        yield { type: "runtime.planning", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "planning", payload: {} };
        if (!flipped) { task.status = "paused"; flipped = true; }
        yield { type: "runtime.response.delta", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "", payload: { delta: "hi" } };
        yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } };
      },
    } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    expect(task.status).toBe("paused");
    expect(interruptedRunId).toBeTruthy();
    expect(db.insertedEvents.find((e: any) => e.type === "task.completed")).toBeFalsy();
    const interrupted = db.insertedEvents.find((e: any) => e.type === "runtime.interrupted");
    expect(interrupted?.payload?.reason).toBe("task_paused");
    expect(task.checkpoint?.statusHint).toBe("interrupted");
  });

  it("resumes queued task from interrupted checkpoint without terminal-ignored skip", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const checkpoint = { version: 1, runId: "run_old", taskId: "tsk_1", lastEventSeq: 7, lastEventType: "runtime.interrupted", updatedAt: "2026-11-27T00:00:00.000Z", statusHint: "interrupted", resumePlan: { version: 1, lastSafeBoundary: "runtime.interrupted", completedToolRefs: [{ name: "browser_snapshot", eventSeq: 4, argsKey: JSON.stringify({ sessionId: "s1" }) }], completedActionHashes: [] } };
    let seenResumePlan: any = undefined;
    const { db, task } = makeDb({ checkpoint, taskStatus: "queued" });
    const runtime = { run: async function* (input: any) { seenResumePlan = input?.context?.runtimeResumePlan; yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } }; } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    const resumed = db.insertedEvents.find((e: any) => e.type === "runtime.checkpoint.resumed");
    expect(resumed?.payload?.resumedFrom).toBe("interrupted");
    expect(seenResumePlan?.lastSafeBoundary).toBe("runtime.checkpoint.resumed");
    expect(db.insertedEvents.find((e: any) => e.type === "runtime.checkpoint.terminal_ignored")).toBeFalsy();
    expect(task.status).toBe("succeeded");
  });
});
  it("does not emit duplicate resume events when interrupted checkpoint was already resumed by control plane", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const checkpoint = { version: 1, runId: "run_old", taskId: "tsk_1", lastEventSeq: 8, lastEventType: "runtime.checkpoint.resume_requested", updatedAt: "2026-11-27T00:00:00.000Z", statusHint: "running", resumePlan: { version: 1, lastSafeBoundary: "runtime.checkpoint.resume_requested", completedToolRefs: [], completedActionHashes: [] } };
    const { db, task } = makeDb({ checkpoint, taskStatus: "queued" });
    const runtime = { run: async function* () { yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } }; } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    const resumed = db.insertedEvents.filter((e: any) => e.type === "runtime.checkpoint.resumed");
    expect(resumed).toHaveLength(1);
    expect(task.status).toBe("succeeded");
  });
  it("passes executedActionHashes from receipts for post-approval dedupe", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const { db, task } = makeDb({ receipts: [{ id: "rcpt_1", taskId: "tsk_1", userId: "u1", actionHash: "ah_exec", status: "executed" }] });
    let seen: any = undefined;
    const runtime = { run: async function* (input: any) { seen = input?.context?.executedActionHashes; yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } }; } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    expect(seen).toContain("ah_exec");
  });
