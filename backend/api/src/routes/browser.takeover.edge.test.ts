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

describe("browser takeover edge contracts (P3)", () => {
  beforeEach(() => { process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0" }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("rejects unowned takeover request without mutating task", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_other" } }), { status: 200, headers: { "content-type": "application/json" } })) as any;
    const task = { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, currentStepId: "run_1", updatedAt: new Date() };
    const db = makeDb({ task, tasks: [] });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/takeover/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "captcha" }) });
    expect(res.status).toBe(403);
    expect(task.status).toBe("running");
    expect(db.events).toHaveLength(0);
  });

  it("returns 404 when session missing and does not mutate task", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404, headers: { "content-type": "application/json" } })) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_missing/takeover/resume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: "x" }) });
    expect(res.status).toBe(404);
    expect(db.events).toHaveLength(0);
  });
});
