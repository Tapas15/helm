import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, auditLog, connectorAccounts } from "@helm/db";

const { maybeStartExternalActionWorkflowMock } = vi.hoisted(() => ({
  maybeStartExternalActionWorkflowMock: vi.fn(async () => ({ started: true, workflowId: "wf_cal", runId: "run_cal" })),
}));

vi.mock("./connector-accounts.js", () => ({ getValidGoogleAccessToken: vi.fn(async () => ({ token: "tok_test" })) }));
vi.mock("../lib/identity-policy.js", () => ({ enforceIdentityPolicyForConnectorAccount: vi.fn(async () => ({ ok: true })) }));
vi.mock("../lib/temporal.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/temporal.js")>();
  return { ...actual, maybeStartExternalActionWorkflow: maybeStartExternalActionWorkflowMock };
});

import { calendarRoutes } from "./calendar.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb() {
  const auditRows: any[] = [];
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionHash: "hash_1" };
  const account = { id: "ca_1", userId: "u1", connectorId: "google-calendar", status: "active" };
  return {
    auditRows,
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === approvals ? [approval] : table === actionReceipts ? [] : table === connectorAccounts ? [account] : [] }) }) }),
    insert: (table: unknown) => ({ values: (v: any) => { if (table === auditLog) auditRows.push(v); return { onConflictDoNothing: () => Promise.resolve(), returning: async () => [v] }; } }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  } as any;
}
function makeApp(db: any) { const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route("/v1/connectors/calendar", calendarRoutes(db)); return app; }

describe("calendar Temporal routing contracts (P5)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write" };
    maybeStartExternalActionWorkflowMock.mockReset();
    maybeStartExternalActionWorkflowMock.mockResolvedValue({ started: true, workflowId: "wf_cal", runId: "run_cal" });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "evt_direct" }), { status: 200, headers: { "content-type": "application/json" } })) as any;
  });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  const cases = [
    { name: "create", path: "/v1/connectors/calendar/events/create", actionKind: "calendar.create_event", body: { accountId: "ca_1", calendarId: "primary", summary: "s", startIso: "2026-11-26T10:00:00Z", endIso: "2026-11-26T11:00:00Z", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_c" } },
    { name: "update", path: "/v1/connectors/calendar/events/update", actionKind: "calendar.update_event", body: { accountId: "ca_1", calendarId: "primary", eventId: "evt_1", summary: "s2", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_u" } },
    { name: "delete", path: "/v1/connectors/calendar/events/delete", actionKind: "calendar.delete_event", body: { accountId: "ca_1", calendarId: "primary", eventId: "evt_1", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_d" } },
  ] as const;

  for (const tc of cases) {
    it(`routes ${tc.name} to Temporal when enabled and returns 202 without direct provider call`, async () => {
      const db = makeDb();
      const res = await makeApp(db).request(tc.path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tc.body) });
      expect(res.status).toBe(202);
      const json = await res.json() as any;
      expect(json).toMatchObject({ ok: true, routed: "temporal" });
      expect(maybeStartExternalActionWorkflowMock).toHaveBeenCalledWith(expect.objectContaining({ actionKind: tc.actionKind, idempotencyKey: tc.body.idempotencyKey }));
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(db.auditRows.some((r: any) => r.action === `${tc.actionKind}.temporal_started`)).toBe(true);
    });

    it(`fails closed 503 on ${tc.name} routing failure`, async () => {
      maybeStartExternalActionWorkflowMock.mockRejectedValueOnce(new Error("temporal down"));
      const db = makeDb();
      const res = await makeApp(db).request(tc.path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tc.body) });
      expect(res.status).toBe(503);
      const json = await res.json() as any;
      expect(json.error.code).toBe("DEPENDENCY_ERROR");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it(`bypasses routing for ${tc.name} when internal temporal header is present`, async () => {
      const db = makeDb();
      const res = await makeApp(db).request(tc.path, { method: "POST", headers: { "content-type": "application/json", "x-helm-temporal-activity": "1" }, body: JSON.stringify(tc.body) });
      expect([200, 204]).toContain(res.status);
      expect(maybeStartExternalActionWorkflowMock).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  }

    it("does not route create when Temporal disabled", async () => {
    process.env.HELM_TEMPORAL_ENABLED = "0";
    const db = makeDb();
    const res = await makeApp(db).request(cases[0].path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cases[0].body) });
    expect(res.status).toBe(200);
    expect(maybeStartExternalActionWorkflowMock).not.toHaveBeenCalled();
  });

  it("rollback: disabling Temporal after enabled config routes create on direct guarded path with no temporal metadata", async () => {
    const db1 = makeDb();
    const r1 = await makeApp(db1).request(cases[0].path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...cases[0].body, idempotencyKey: "idem_c_en" }) });
    expect(r1.status).toBe(202);
    expect(maybeStartExternalActionWorkflowMock).toHaveBeenCalledTimes(1);

    process.env.HELM_TEMPORAL_ENABLED = "0";
    maybeStartExternalActionWorkflowMock.mockClear();
    (globalThis.fetch as any).mockClear();
    const db2 = makeDb();
    const r2 = await makeApp(db2).request(cases[0].path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...cases[0].body, idempotencyKey: "idem_c_rb" }) });
    expect(r2.status).toBe(200);
    const json = await r2.json() as any;
    expect(json.routed).toBeUndefined();
    expect(maybeStartExternalActionWorkflowMock).not.toHaveBeenCalled();
    expect(db2.auditRows.some((r: any) => String(r.action).includes("temporal_started"))).toBe(false);
  });
});

