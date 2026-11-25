import { describe, expect, it } from "vitest";
import { feedbackEvents } from "@helm/db";
import { processTask } from "./index.js";

function makeDb() {
  const feedbackRows: any[] = [];
  const task: any = { id: "tsk_1", userId: "u1", status: "running", prompt: "hello", kind: "chat", state: null, startedAt: new Date(), createdAt: new Date() };
  const chain = (rows: any[] = []) => {
    const c: any = Promise.resolve(rows);
    c.where = () => chain(rows);
    c.orderBy = () => chain(rows);
    c.limit = async () => rows;
    c.returning = async () => rows;
    return c;
  };
  const db: any = {
    feedbackRows,
    select: () => ({ from: (_t: unknown) => chain([]) }),
    insert: (table: unknown) => ({ values: async (v: any) => { if (table === feedbackEvents) feedbackRows.push(v); return { onConflictDoNothing: async () => undefined, returning: async () => [v] }; } }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => { Object.assign(task, v); return [task]; } }) }) }),
  };
  return { db, task };
}

describe("worker processTask feedback integration (P7a)", () => {
  it("emits redacted task_outcome on completion when enabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const { db, task } = makeDb();
    const runtime = { run: async function* () { yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } }; } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    const row = db.feedbackRows.find((r: any) => r.kind === "task_outcome");
    expect(row).toBeTruthy();
    expect(row.signal).toBe("positive");
    expect(row.payload?.summary).toBe("task.succeeded");
    expect(row.redacted).toBe(true);
  });

  it("does not emit feedback on completion when disabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const { db, task } = makeDb();
    const runtime = { run: async function* () { yield { type: "runtime.completed", ts: new Date().toISOString(), trace: { taskId: task.id }, message: "done", payload: { status: "succeeded", output: "ok" } }; } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    expect(db.feedbackRows).toHaveLength(0);
  });

  it("emits redacted tool_failure on runtime crash and never leaks secret", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const { db, task } = makeDb();
    const runtime = { run: async function* () { throw new Error("Bearer sk-secret crash"); } } as any;
    await processTask(task, { db, runtime, workerId: "w1" });
    const row = db.feedbackRows.find((r: any) => r.kind === "tool_failure");
    expect(row).toBeTruthy();
    expect(row.signal).toBe("negative");
    expect(row.payload?.summary).toBe("task.failed.runtime_crash");
    expect(row.redacted).toBe(true);
    expect(JSON.stringify(row)).not.toContain("sk-secret");
  });
});
