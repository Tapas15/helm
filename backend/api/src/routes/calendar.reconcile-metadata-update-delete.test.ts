import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, connectorAccounts } from "@helm/db";

vi.mock("./connector-accounts.js", () => ({
  getValidGoogleAccessToken: vi.fn(async () => ({ token: "tok_test" })),
}));
vi.mock("../lib/identity-policy.js", () => ({
  enforceIdentityPolicyForConnectorAccount: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../lib/temporal.js", () => ({
  maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })),
}));

import { calendarRoutes } from "./calendar.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb() {
  const updates: any[] = [];
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionHash: "hash_1" };
  const account = { id: "ca_1", userId: "u1", connectorId: "google-calendar", status: "active" };
  return {
    updates,
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
    insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
    update: (table: unknown) => ({
      set: (v: any) => ({
        where: () => { if (table === actionReceipts) updates.push(v); return Promise.resolve(); },
      }),
    }),
  } as any;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/connectors/calendar", calendarRoutes(db));
  return app;
}

describe("calendar update/delete reconcile metadata (P4/P5 deterministic)", () => {
  beforeEach(() => { process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_FEEDBACK_ENABLED: "0" }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("update persists reconcile metadata on uncertain network error", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); }) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/calendar/events/update", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", summary: "S", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_u" }),
    });
    expect(res.status).toBe(503);
    expect(db.updates.at(-1)?.evidence).toMatchObject({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", uncertain: true });
  });

  it("update persists reconcile metadata on failed provider response", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400, headers: { "content-type": "application/json" } })) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/calendar/events/update", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", summary: "S", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_u2" }),
    });
    expect(res.status).toBe(400);
    expect(db.updates.at(-1)?.evidence).toMatchObject({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", uncertain: false, status: 400 });
  });

  it("update persists reconcile metadata on executed response", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "evt_1", htmlLink: "https://x", status: "confirmed" }), { status: 200, headers: { "content-type": "application/json" } })) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/calendar/events/update", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", summary: "S", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_u3" }),
    });
    expect(res.status).toBe(200);
    expect(db.updates.at(-1)?.evidence).toMatchObject({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", calendarEventId: "evt_1" });
  });

  it("delete persists reconcile metadata on uncertain network error", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); }) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/calendar/events/delete", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_d" }),
    });
    expect(res.status).toBe(503);
    expect(db.updates.at(-1)?.evidence).toMatchObject({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", uncertain: true });
  });

  it("delete persists reconcile metadata on failed provider response", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400, headers: { "content-type": "application/json" } })) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/calendar/events/delete", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_d2" }),
    });
    expect(res.status).toBe(400);
    expect(db.updates.at(-1)?.evidence).toMatchObject({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", uncertain: false, status: 400 });
  });

  it("delete persists reconcile metadata on executed response", async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/calendar/events/delete", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_d3" }),
    });
    expect(res.status).toBe(200);
    expect(db.updates.at(-1)?.evidence).toMatchObject({ accountId: "ca_1", calendarId: "primary", eventId: "evt_1", deleted: true });
  });
});
