import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { taskEvents, tasks, auditLog } from "@helm/db";
vi.mock("../lib/temporal.js", () => ({ maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })) }));
import { browserRoutes } from "./browser.js";

const env = { ...process.env }; const realFetch = globalThis.fetch;
function makeDb(opts?: { task?: any; tasks?: any[] }) {
  const task = opts?.task ?? { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, currentStepId: "run_1", updatedAt: new Date() };
  const taskRows = opts?.tasks ?? [task];
  const events: any[] = []; const audits: any[] = [];
  const thenable = (value: any) => { const p: any = Promise.resolve(value); p.catch = (fn: any) => Promise.resolve(value).catch(fn); p.onConflictDoNothing = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); return p; };
  return {
    task, events, audits,
    select: () => ({ from: (table: unknown) => ({ where: () => thenable(table === tasks ? taskRows : []), orderBy: () => thenable(table === tasks ? taskRows : []) }) }),
    insert: (table: unknown) => ({ values: (v: any) => { if (table === taskEvents) events.push(v); if (table === auditLog) audits.push(v); return thenable([v]); } }),
    update: (table: unknown) => ({ set: (v: any) => ({ where: () => { if (table === tasks) Object.assign(task, v); return thenable([]); } }) }),
  } as any;
}
function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

describe("browser takeover input/edge contracts (P3)", () => {
  beforeEach(() => { process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0" }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("returns 400 on invalid takeover input and does not mutate task", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/takeover/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: 123 }) });
    expect(res.status).toBe(400);
    expect(db.task.status).toBe("running");
    expect((db.task.state as any).takeover).toBeUndefined();
    expect(db.events).toHaveLength(0);
  });

  it("returns 400 on invalid resume input and does not mutate task", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as any;
    const task = { id: "tsk_1", userId: "u1", status: "waiting_input", state: { activeBrowserSessionId: "sess_1", takeover: { active: true } }, currentStepId: "run_1", updatedAt: new Date(), leaseOwner: "w1", leaseUntil: new Date() };
    const db = makeDb({ task });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/takeover/resume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: { bad: true } }) });
    expect(res.status).toBe(400);
    expect(task.status).toBe("waiting_input");
    expect(task.leaseOwner).toBe("w1");
    expect(db.events).toHaveLength(0);
  });
});
