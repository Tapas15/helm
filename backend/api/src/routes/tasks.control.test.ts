import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { auditLog, taskEvents, tasks } from "@helm/db";
import { taskRoutes } from "./tasks.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function makeDb(opts?: { task?: any }) {
  const task = opts?.task ?? { id: "tsk_1", userId: "u1", status: "paused", checkpoint: { version: 1, statusHint: "interrupted", lastEventType: "runtime.interrupted", resumePlan: { version: 1, lastSafeBoundary: "runtime.interrupted", completedToolRefs: [], completedActionHashes: [] } }, state: {}, completedAt: null, leaseOwner: "w1", leaseUntil: new Date(), errorCode: "ERR", errorMessage: "boom" };
  const inserts: any[] = [];
  const updates: any[] = [];
  const db: any = {
    inserts, updates, task,
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => (table === tasks ? [task] : []), orderBy: () => ({ limit: async () => [] }) }) }) }),
    insert: (table: unknown) => ({ values: async (v: any) => { inserts.push({ table, value: v }); if (table === taskEvents) return [v]; if (table === auditLog) return [v]; return [v]; } }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => { updates.push(v); Object.assign(task, v); return [task]; } }) }) }),
  };
  return db;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); (c.set as any)("logger", { info: () => undefined }); await next(); });
  app.route("/v1/tasks", taskRoutes(db));
  return app;
}

describe("task control checkpoint reset (P2)", () => {
  it("resume from paused resets interrupted checkpoint to running boundary", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/tasks/tsk_1/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resume" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.task.status).toBe("queued");
    expect(db.updates[0].checkpoint.statusHint).toBe("running");
    expect(db.updates[0].checkpoint.lastEventType).toBe("runtime.checkpoint.resume_requested");
    expect(db.updates[0].checkpoint.resumePlan.lastSafeBoundary).toBe("runtime.checkpoint.resume_requested");
    const evt = db.inserts.find((i: any) => i.table === taskEvents);
    expect(evt.value.payload.checkpointReset).toBe(true);
  });

  it("cancel does not mark checkpoint reset", async () => {
    const db = makeDb({ task: { id: "tsk_1", userId: "u1", status: "running", checkpoint: { version: 1, statusHint: "running" }, state: {}, completedAt: null, leaseOwner: "w1", leaseUntil: new Date(), errorCode: null, errorMessage: null } });
    const res = await makeApp(db).request("/v1/tasks/tsk_1/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
    expect(res.status).toBe(200);
    const evt = db.inserts.find((i: any) => i.table === taskEvents);
    expect(evt.value.payload.checkpointReset).toBe(false);
  });
});
