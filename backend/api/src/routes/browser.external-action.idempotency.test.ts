import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, identityPolicies, taskEvents, tasks } from "@helm/db";

vi.mock("../lib/temporal.js", () => ({ maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })) }));

import { browserRoutes } from "./browser.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb(existingReceipt: any) {
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionKind: "browser.external_action", actionHash: "hash_1" };
  const task = { id: "tsk_1", userId: "u1", status: "running", state: { activeBrowserSessionId: "sess_1" } };
  const receiptRows: any[] = existingReceipt ? [existingReceipt] : [];
  const chain = (rows: any[]) => { const c: any = { where: () => c, orderBy: () => c, limit: async () => rows, then: (r: any, j: any) => Promise.resolve(rows).then(r, j), catch: (j: any) => Promise.resolve(rows).catch(j) }; return c; };
  return {
    select: (_shape?: any) => ({ from: (table: unknown) => ({ where: () => table === approvals ? chain([approval]) : table === actionReceipts ? chain(receiptRows.slice(-1)) : table === tasks ? chain([task]) : table === identityPolicies ? chain([]) : table === taskEvents ? chain([{ max: -1 }]) : chain([]) }) }),
    insert: () => ({ values: (v: any) => { if (v?.idempotencyKey) receiptRows.push({ id: v.id ?? "rcpt_new", ...v }); return { onConflictDoNothing: () => Promise.resolve(), returning: async () => [v] }; } }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => { if (receiptRows.length) { Object.assign(receiptRows[receiptRows.length - 1], v); return [receiptRows[receiptRows.length - 1]]; } return []; }, then: (r: any, j: any) => Promise.resolve().then(r, j) }) }) }),
  } as any;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

const body = { approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_b", action: "submit", selector: "#x" };

describe("browser external action idempotency safety (P4/P5 deterministic)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_BROWSER_ADAPTER_DISPATCH: "0" };
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/v1/sessions/sess_1") && !url.includes("/external-action")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1", metadata: {} } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
  });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("returns 409 when idempotency key reused with different action hash", async () => {
    const db = makeDb({ id: "rcpt_old", userId: "u1", approvalId: "apr_1", actionHash: "hash_other", status: "executed", externalRef: null });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(409);
    const json = await res.json() as any;
    expect(json.error.message).toMatch(/Idempotency key reused/i);
    const externalCalls = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("/external-action"));
    expect(externalCalls).toHaveLength(0);
  });

  it("returns 409 when idempotency key reused with different approval", async () => {
    const db = makeDb({ id: "rcpt_old", userId: "u1", approvalId: "apr_other", actionHash: "hash_1", status: "executed", externalRef: null });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(409);
    const externalCalls = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("/external-action"));
    expect(externalCalls).toHaveLength(0);
  });

  it("dedupes when same key matches same approval/action and is executed", async () => {
    const db = makeDb({ id: "rcpt_old", userId: "u1", approvalId: "apr_1", actionHash: "hash_1", status: "executed", externalRef: "ref1" });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.data?.deduped ?? json.deduped).toBe(true);
    const externalCalls = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("/external-action"));
    expect(externalCalls).toHaveLength(0);
  });

  it("claims approved receipt atomically before external side effect", async () => {
    const db = makeDb({ id: "rcpt_approved", userId: "u1", approvalId: "apr_1", actionHash: "hash_1", status: "approved", evidence: {} });
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.data?.receiptId).toBe("rcpt_approved");
    const externalCalls = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("/external-action"));
    expect(externalCalls).toHaveLength(1);
  });
});
