import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { taskEvents, tasks, auditLog } from "@helm/db";
vi.mock("../lib/temporal.js", () => ({ maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })) }));
import { browserRoutes } from "./browser.js";

const env = { ...process.env }; const realFetch = globalThis.fetch;
function makeDb(opts?: { task?: any }) {
  const task = opts?.task ?? { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, currentStepId: "run_1", updatedAt: new Date() };
  const taskRows = [task];
  const updates: any[] = [];
  const events: any[] = [];
  const audits: any[] = [];
  const thenable = (value: any) => { const p: any = Promise.resolve(value); p.catch = (fn: any) => Promise.resolve(value).catch(fn); p.onConflictDoNothing = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); return p; };
  return {
    task, updates, events, audits,
    select: () => ({ from: (table: unknown) => ({ where: () => thenable(table === tasks ? taskRows : []), orderBy: () => thenable(table === taskEvents ? events : []) }) }),
    insert: (table: unknown) => ({ values: (v: any) => { if (table === taskEvents) events.push(v); if (table === auditLog) audits.push(v); return thenable([v]); } }),
    update: (table: unknown) => ({ set: (v: any) => ({ where: () => { if (table === tasks) { updates.push(v); Object.assign(task, v); } return thenable([]); } }) }),
  } as any;
}
function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

describe("browser takeover state contracts (P3)", () => {
  beforeEach(() => { process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0" }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("request sets waiting_input/takeover active and emits event/audit once", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/takeover/request")) return new Response(JSON.stringify({ ok: true, sessionId: "sess_1", action: "takeover.request", data: { control: { owner: "user" } } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb();
    const app = makeApp(db);
    const r1 = await app.request("/v1/browser/sessions/sess_1/takeover/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "captcha" }) });
    expect(r1.status).toBe(200);
    expect(db.task.status).toBe("waiting_input");
    expect((db.task.state as any).takeover).toMatchObject({ active: true, reason: "captcha" });
    expect(db.events.filter((e: any) => e.type === "browser.takeover.requested")).toHaveLength(1);
    const r2 = await app.request("/v1/browser/sessions/sess_1/takeover/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "captcha" }) });
    expect(r2.status).toBe(200);
    expect(db.events.filter((e: any) => e.type === "browser.takeover.requested")).toHaveLength(1);
  });

  it("resume sets queued/takeover inactive and clears lease once", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/takeover/resume")) return new Response(JSON.stringify({ ok: true, sessionId: "sess_1", action: "takeover.resume", data: { control: { owner: "agent" } } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb({ task: { id: "tsk_1", userId: "u1", status: "waiting_input", state: { activeBrowserSessionId: "sess_1", takeover: { active: true, reason: "captcha" } }, currentStepId: "run_1", updatedAt: new Date(), leaseOwner: "w1", leaseUntil: new Date() } });
    const app = makeApp(db);
    const r1 = await app.request("/v1/browser/sessions/sess_1/takeover/resume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: "done" }) });
    expect(r1.status).toBe(200);
    expect(db.task.status).toBe("queued");
    expect(db.task.leaseOwner).toBeNull();
    expect((db.task.state as any).takeover).toMatchObject({ active: false, note: "done" });
    expect(db.events.filter((e: any) => e.type === "browser.takeover.resumed")).toHaveLength(1);
    const r2 = await app.request("/v1/browser/sessions/sess_1/takeover/resume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: "done" }) });
    expect(r2.status).toBe(200);
    expect(db.events.filter((e: any) => e.type === "browser.takeover.resumed")).toHaveLength(1);
  });

  it("does not mutate task on worker takeover failure", async () => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1" } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/takeover/request")) return new Response(JSON.stringify({ ok: false, error: { code: "FAIL", message: "no", retryable: false } }), { status: 500, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/takeover/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "captcha" }) });
    expect(res.status).toBe(500);
    expect(db.task.status).toBe("running");
    expect((db.task.state as any).takeover).toBeUndefined();
    expect(db.events).toHaveLength(0);
  });
});
