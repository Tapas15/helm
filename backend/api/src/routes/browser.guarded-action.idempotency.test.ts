import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, auditLog, taskEvents, tasks } from "@helm/db";

vi.mock("../lib/temporal.js", () => ({ maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })) }));

import { browserRoutes } from "./browser.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb(existingReceipt: any) {
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionKind: "browser.navigate", actionHash: "hash_1" };
  const task = { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" }, currentStepId: "run_1" };
  const receiptRows: any[] = existingReceipt ? [existingReceipt] : [];
  const audits: any[] = [];
  const events: any[] = [];
  const chain = (rows: any[]) => { const c: any = { where: () => c, orderBy: () => c, limit: async () => rows, then: (r: any, j: any) => Promise.resolve(rows).then(r, j), catch: (j: any) => Promise.resolve(rows).catch(j) }; return c; };
  return {
    audits,
    select: (_shape?: any) => ({ from: (table: unknown) => ({ where: () => table === approvals ? chain([approval]) : table === actionReceipts ? chain(receiptRows.slice(-1)) : table === tasks ? chain([task]) : table === taskEvents ? chain([{ max: -1 }]) : chain([]) }) }),
    insert: (table: unknown) => ({ values: (v: any) => { if (table === auditLog) audits.push(v); if (table === taskEvents) events.push(v); if (v?.idempotencyKey) receiptRows.push({ id: v.id ?? "rcpt_new", ...v }); return { onConflictDoNothing: () => Promise.resolve(), returning: async () => [v] }; } }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => { if (receiptRows.length) { Object.assign(receiptRows[receiptRows.length - 1], v); return [receiptRows[receiptRows.length - 1]]; } return []; }, then: (r: any, j: any) => Promise.resolve().then(r, j) }) }) }),
  } as any;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

const body = { approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_nav", url: "https://example.com" };

describe("browser guarded action idempotency (P3/P4 deterministic)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0" };
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/v1/sessions/sess_1/navigate")) return new Response(JSON.stringify({ ok: true, data: { url: "https://example.com" } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/v1/sessions/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1", metadata: {} } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
  });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("rejects reused idempotency key with different action hash before proxy", async () => {
    const db = makeDb({ id: "rcpt_old", userId: "u1", approvalId: "apr_1", actionHash: "hash_other", status: "executed" });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/navigate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(409);
    expect((globalThis.fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes("/navigate"))).toBe(false);
  });

  it("dedupes executed receipt without proxy call", async () => {
    const db = makeDb({ id: "rcpt_old", userId: "u1", approvalId: "apr_1", actionHash: "hash_1", status: "executed" });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/navigate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.deduped).toBe(true);
    expect((globalThis.fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes("/navigate"))).toBe(false);
  });

  it("claims approved receipt atomically and executes once", async () => {
    const db = makeDb({ id: "rcpt_approved", userId: "u1", approvalId: "apr_1", actionHash: "hash_1", status: "approved", evidence: {} });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/navigate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.data?.receiptId).toBe("rcpt_approved");
    const navCalls = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("/navigate"));
    expect(navCalls).toHaveLength(1);
  });

  it("claims approved receipt for click guarded action", async () => {
    const db = makeDb({ id: "rcpt_click", userId: "u1", approvalId: "apr_1", actionHash: "hash_1", status: "approved", evidence: {} });
    const clickBody = { approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_click", selector: "#btn" };
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/v1/sessions/sess_1/click")) return new Response(JSON.stringify({ ok: true, data: { clicked: true } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/v1/sessions/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1", metadata: {} } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(clickBody) });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.data?.receiptId).toBe("rcpt_click");
    expect((globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("/click"))).toHaveLength(1);
  });

  it("claims approved receipt for fill guarded action", async () => {
    const db = makeDb({ id: "rcpt_fill", userId: "u1", approvalId: "apr_1", actionHash: "hash_1", status: "approved", evidence: {} });
    const fillBody = { approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_fill", selector: "#in", value: "hi" };
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/v1/sessions/sess_1/fill")) return new Response(JSON.stringify({ ok: true, data: { filled: true } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/v1/sessions/sess_1")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1", metadata: {} } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/fill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fillBody) });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.data?.receiptId).toBe("rcpt_fill");
    expect((globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("/fill"))).toHaveLength(1);
  });
});
