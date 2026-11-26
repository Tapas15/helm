import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, auditLog, connectorAccounts, feedbackEvents } from "@helm/db";

const { maybeStartExternalActionWorkflowMock } = vi.hoisted(() => ({
  maybeStartExternalActionWorkflowMock: vi.fn(async () => ({ started: true, workflowId: "wf_1", runId: "run_wf_1" })),
}));

vi.mock("./connector-accounts.js", () => ({
  getValidGoogleAccessToken: vi.fn(async () => ({ token: "tok_test" })),
}));
vi.mock("../lib/identity-policy.js", () => ({
  enforceIdentityPolicyForConnectorAccount: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../lib/temporal.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/temporal.js")>();
  return { ...actual, maybeStartExternalActionWorkflow: maybeStartExternalActionWorkflowMock };
});

import { gmailRoutes } from "./gmail.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb() {
  const auditRows: any[] = [];
  const feedbackRows: any[] = [];
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionHash: "hash_1" };
  const account = { id: "ca_1", userId: "u1", connectorId: "google-gmail", status: "active" };
  const db = {
    auditRows, feedbackRows,
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === approvals) return [approval];
            if (table === actionReceipts) return [];
            if (table === connectorAccounts) return [account];
            return [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: any) => {
        if (table === auditLog) auditRows.push(v);
        if (table === feedbackEvents) feedbackRows.push(v);
        return { onConflictDoNothing: () => Promise.resolve(), returning: async () => [v] };
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  } as any;
  return db;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/connectors/gmail", gmailRoutes(db));
  return app;
}

describe("gmail send Temporal routing contracts (P5)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write", HELM_TEMPORAL_TEST_MODE: "stub" };
    maybeStartExternalActionWorkflowMock.mockReset();
    maybeStartExternalActionWorkflowMock.mockResolvedValue({ started: true, workflowId: "wf_1", runId: "run_wf_1" });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "msg_direct" }), { status: 200, headers: { "content-type": "application/json" } })) as any;
  });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  const body = { accountId: "ca_1", to: ["a@example.com"], subject: "s", bodyText: "b", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_1" };

  it("routes to Temporal when enabled and returns 202 without direct provider call", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(202);
    const json = await res.json() as any;
    expect(json).toMatchObject({ ok: true, routed: "temporal", workflowId: "wf_1", runId: "run_wf_1" });
    expect(maybeStartExternalActionWorkflowMock).toHaveBeenCalledWith(expect.objectContaining({ actionKind: "gmail.send", idempotencyKey: "idem_1", approvalId: "apr_1" }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(db.auditRows.some((r: any) => r.action === "gmail.send.temporal_started")).toBe(true);
  });

  it("fails closed with 503 when Temporal routing throws", async () => {
    maybeStartExternalActionWorkflowMock.mockRejectedValueOnce(new Error("temporal down"));
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(503);
    const json = await res.json() as any;
    expect(json.error.code).toBe("DEPENDENCY_ERROR");
    expect(String(json.error.message)).toContain("Temporal routing failed");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("internal temporal activity header bypasses re-entry routing and uses direct path", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/gmail/send", {
      method: "POST",
      headers: { "content-type": "application/json", "x-helm-temporal-activity": "1" },
      body: JSON.stringify(body),
    });
    // direct path will attempt provider call; our mock fetch returns 200 success
    expect(res.status).toBe(200);
    expect(maybeStartExternalActionWorkflowMock).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalled();
  });

    it("does not route when Temporal disabled", async () => {
    process.env.HELM_TEMPORAL_ENABLED = "0";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    expect(maybeStartExternalActionWorkflowMock).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("rollback: disabling Temporal after enabled config uses direct guarded path with no temporal audit metadata", async () => {
    // Simulate prior enabled run in same process by first doing a routed call.
    const db1 = makeDb();
    const r1 = await makeApp(db1).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: "idem_enabled" }) });
    expect(r1.status).toBe(202);
    expect(maybeStartExternalActionWorkflowMock).toHaveBeenCalledTimes(1);

    // Rollback flag off.
    process.env.HELM_TEMPORAL_ENABLED = "0";
    maybeStartExternalActionWorkflowMock.mockClear();
    (globalThis.fetch as any).mockClear();
    const db2 = makeDb();
    const r2 = await makeApp(db2).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: "idem_rollback" }) });
    expect(r2.status).toBe(200);
    const json = await r2.json() as any;
    expect(json.routed).toBeUndefined();
    expect(json.workflowId).toBeUndefined();
    expect(maybeStartExternalActionWorkflowMock).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(db2.auditRows.some((r: any) => String(r.action).includes("temporal_started"))).toBe(false);
  });
});

