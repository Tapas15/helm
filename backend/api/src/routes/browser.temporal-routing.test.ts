import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, auditLog, identityPolicies, taskEvents } from "@helm/db";

const { maybeStartExternalActionWorkflowMock } = vi.hoisted(() => ({
  maybeStartExternalActionWorkflowMock: vi.fn(async () => ({ started: true, workflowId: "wf_browser", runId: "run_browser" })),
}));

vi.mock("../lib/temporal.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/temporal.js")>();
  return { ...actual, maybeStartExternalActionWorkflow: maybeStartExternalActionWorkflowMock };
});

import { browserRoutes } from "./browser.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb() {
  const auditRows: any[] = [];
  const receipts: any[] = [];
  const events: any[] = [];
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionKind: "browser.external_action", actionHash: "hash_1" };
  const chain = (rows: any[]) => {
    const c: any = { where: () => c, orderBy: () => c, limit: async () => rows, then: (r: any, j: any) => Promise.resolve(rows).then(r, j), catch: (j: any) => Promise.resolve(rows).catch(j) };
    return c;
  };
  return {
    auditRows, events,
    select: (_shape?: any) => ({ from: (table: unknown) => ({ where: () => table === approvals ? chain([approval]) : table === actionReceipts ? chain(receipts.slice(-1)) : table === identityPolicies ? chain([]) : table === taskEvents ? chain([{ max: -1 }]) : chain([]) }) }),
    insert: (table: unknown) => ({
      values: (v: any) => {
        if (table === auditLog) auditRows.push(v);
        if (table === actionReceipts) receipts.push({ id: v.id ?? "rcpt_1", status: v.status ?? "executing", ...v });
        if (table === taskEvents) events.push(v);
        return { onConflictDoNothing: () => Promise.resolve(), returning: async () => [v] };
      },
    }),
    update: () => ({ set: (_v: any) => ({ where: () => ({ returning: async () => [] }) }) }),
  } as any;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); (c.set as any)("requestId", "req_1"); (c.set as any)("correlationId", "cor_1"); await next(); });
  app.route("/v1/browser", browserRoutes(db));
  return app;
}

describe("browser external action Temporal routing contracts (P5)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write", HELM_BROWSER_ADAPTER_DISPATCH: "0" };
    maybeStartExternalActionWorkflowMock.mockReset();
    maybeStartExternalActionWorkflowMock.mockResolvedValue({ started: true, workflowId: "wf_browser", runId: "run_browser" });
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/external-action")) return new Response(JSON.stringify({ ok: true, data: { receiptId: "rcpt_direct" } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/v1/sessions/")) return new Response(JSON.stringify({ session: { id: "sess_1", taskId: "tsk_1", metadata: {} } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
  });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  const body = { approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_b", action: "submit", params: { selector: "#x" } };

  it("routes browser.external_action to Temporal and returns 202 without direct browser-worker call", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(202);
    const json = await res.json() as any;
    expect(json).toMatchObject({ ok: true, routed: "temporal", workflowId: "wf_browser" });
    expect(maybeStartExternalActionWorkflowMock).toHaveBeenCalledWith(expect.objectContaining({ actionKind: "browser.external_action", idempotencyKey: "idem_b", approvalId: "apr_1" }));
    const fetchCalls = (globalThis.fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(fetchCalls.some((u: string) => u.includes("/external-action"))).toBe(false);
    expect(db.auditRows.some((r: any) => r.action === "browser.external_action.temporal_started")).toBe(true);
  });

  it("fails closed 503 when Temporal routing throws", async () => {
    maybeStartExternalActionWorkflowMock.mockRejectedValueOnce(new Error("temporal down"));
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(503);
    const json = await res.json() as any;
    expect(json.error.code).toBe("DEPENDENCY_ERROR");
  });

  it("bypasses routing when internal temporal header is present", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json", "x-helm-temporal-activity": "1" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    expect(maybeStartExternalActionWorkflowMock).not.toHaveBeenCalled();
  });

    it("does not route when Temporal disabled", async () => {
    process.env.HELM_TEMPORAL_ENABLED = "0";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    expect(maybeStartExternalActionWorkflowMock).not.toHaveBeenCalled();
  });

  it("rollback: disabling Temporal after enabled config uses direct path with no temporal audit metadata", async () => {
    const db1 = makeDb();
    const r1 = await makeApp(db1).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: "idem_b_en" }) });
    expect(r1.status).toBe(202);
    expect(maybeStartExternalActionWorkflowMock).toHaveBeenCalledTimes(1);

    process.env.HELM_TEMPORAL_ENABLED = "0";
    maybeStartExternalActionWorkflowMock.mockClear();
    (globalThis.fetch as any).mockClear();
    const db2 = makeDb();
    const r2 = await makeApp(db2).request("/v1/browser/sessions/sess_1/external-action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: "idem_b_rb" }) });
    expect(r2.status).toBe(200);
    const json = await r2.json() as any;
    expect(json.routed).toBeUndefined();
    expect(maybeStartExternalActionWorkflowMock).not.toHaveBeenCalled();
    expect(db2.auditRows.some((r: any) => String(r.action).includes("temporal_started"))).toBe(false);
  });
});

