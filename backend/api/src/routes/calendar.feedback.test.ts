import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, connectorAccounts, feedbackEvents } from "@helm/db";

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
  const feedbackRows: any[] = [];
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionHash: "hash_1" };
  const account = { id: "ca_1", userId: "u1", connectorId: "google-calendar", status: "active" };
  const db = {
    feedbackRows,
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
  app.route("/v1/connectors/calendar", calendarRoutes(db));
  return app;
}

describe("calendar create feedback emission (P7a)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_TEMPORAL_MODE: "off" };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "upstream" } }), { status: 500, headers: { "content-type": "application/json" } })) as any;
  });
  afterEach(() => {
    process.env = { ...env };
    globalThis.fetch = realFetch;
    vi.clearAllMocks();
  });

  it("does not emit feedback when disabled on provider failure", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/calendar/events/create", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "ca_1", calendarId: "primary", summary: "s", startIso: "2026-11-26T10:00:00Z", endIso: "2026-11-26T11:00:00Z", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_1" }),
    });
    expect(res.status).toBe(500);
    expect(db.feedbackRows).toHaveLength(0);
  });

  it("emits redacted tool_failure feedback when enabled on provider failure", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/calendar/events/create", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "ca_1", calendarId: "primary", summary: "s", startIso: "2026-11-26T10:00:00Z", endIso: "2026-11-26T11:00:00Z", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_1" }),
    });
    expect(res.status).toBe(500);
    const row = db.feedbackRows.find((r: any) => r.kind === "tool_failure");
    expect(row).toBeTruthy();
    expect(row.payload?.actionKind).toBe("calendar.create_event");
    expect(row.payload?.receiptId).toBeTruthy();
    expect(row.redacted).toBe(true);
    expect(JSON.stringify(row)).not.toContain("tok_test");
  });

  it("emits redacted uncertain tool_failure on network error", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    globalThis.fetch = vi.fn(async () => { throw new Error("Bearer tok_test network down"); }) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/calendar/events/create", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "ca_1", calendarId: "primary", summary: "s", startIso: "2026-11-26T10:00:00Z", endIso: "2026-11-26T11:00:00Z", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_net" }),
    });
    expect(res.status).toBe(503);
    const row = db.feedbackRows.find((r: any) => r.kind === "tool_failure");
    expect(row).toBeTruthy();
    expect(row.severity).toBe("error");
    expect(row.payload?.uncertain).toBe(true);
    expect(row.payload?.actionKind).toBe("calendar.create_event");
    expect(row.redacted).toBe(true);
    expect(JSON.stringify(row)).not.toContain("tok_test");
  });
});
