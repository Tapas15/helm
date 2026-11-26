import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { auditLog, taskEvents, tasks } from "@helm/db";
vi.mock("../lib/temporal.js", () => ({ maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })) }));
import { browserRoutes } from "./browser.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb(opts?: { task?: any; tasksRows?: any[] }) {
  const task = opts?.task ?? { id: "tsk_1", userId: "u1", status: "running", state: {}, currentStepId: "run_1", updatedAt: new Date() };
  const tasksRows = opts?.tasksRows ?? [task];
  const events: any[] = [];
  const audits: any[] = [];
  const updates: any[] = [];
  const thenable = (value: any) => {
    const p: any = Promise.resolve(value);
    p.catch = (fn: any) => Promise.resolve(value).catch(fn);
    p.onConflictDoNothing = () => thenable(value);
    p.returning = async () => Array.isArray(value) ? value : [value];
    p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value;
    p.orderBy = () => thenable(value);
    return p;
  };
  return {
    task, events, audits, updates,
    select: () => ({ from: (table: unknown) => ({ where: () => thenable(table === tasks ? tasksRows : []) }) }),
    insert: (table: unknown) => ({ values: (v: any) => { if (table === taskEvents) events.push(v); if (table === auditLog) audits.push(v); return thenable([v]); } }),
    update: (table: unknown) => ({ set: (v: any) => ({ where: () => { if (table === tasks) { updates.push(v); Object.assign(task, v); } return thenable([]); } }) }),
  } as any;
}

function makeApp(db: any, userId = "u1") {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", userId); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

describe("browser session rebind contracts (P3)", () => {
  beforeEach(() => { process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0" }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("rebinds legacy-unbound session to owned task and emits event/audit", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/v1/sessions/sess_legacy")) return new Response(JSON.stringify({ session: { id: "sess_legacy", taskId: null } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb({ task: { id: "tsk_1", userId: "u1", status: "running", state: {}, updatedAt: new Date() } });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_legacy/rebind", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "tsk_1" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toMatchObject({ ok: true, sessionId: "sess_legacy", taskId: "tsk_1", rebound: true });
    expect((db.task.state as any).activeBrowserSessionId).toBe("sess_legacy");
    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({ type: "browser.session.rebound", taskId: "tsk_1", payload: { sessionId: "sess_legacy", previousTaskId: null, policy: "explicit-rebind-owned-task" } });
    expect(db.audits[0]).toMatchObject({ action: "browser.session.rebound", resourceId: "sess_legacy", decision: "allow" });
  });

  it("denies rebind when target task is not owned by caller", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/v1/sessions/sess_legacy")) return new Response(JSON.stringify({ session: { id: "sess_legacy", taskId: null } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb({ task: undefined, tasksRows: [] }); // task lookup returns nothing for this user
    const res = await makeApp(db, "u2").request("/v1/browser/sessions/sess_legacy/rebind", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "tsk_1" }) });
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error.code).toBe("NOT_FOUND");
    expect(db.events).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
  });

  it("rejects rebind when session is already bound to a different task", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/v1/sessions/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_other" } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/rebind", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "tsk_1" }) });
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.details).toMatchObject({ sessionTaskId: "tsk_other" });
    expect(db.events).toHaveLength(0);
  });

  it("rejects rebind when target task already has another active browser session", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/v1/sessions/sess_2")) return new Response(JSON.stringify({ session: { id: "sess_2", taskId: null } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb({ task: { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, updatedAt: new Date() } });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_2/rebind", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "tsk_1" }) });
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.details).toMatchObject({ activeBrowserSessionId: "sess_1" });
    expect(db.events).toHaveLength(0);
  });

  it("rejects invalid rebind input without taskId", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/rebind", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
