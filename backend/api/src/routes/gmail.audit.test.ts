import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts, approvals, auditLog, connectorAccounts } from "@helm/db";

vi.mock("./connector-accounts.js", () => ({
  getValidGoogleAccessToken: vi.fn(async () => ({ token: "tok_test" })),
}));
vi.mock("../lib/identity-policy.js", () => ({
  enforceIdentityPolicyForConnectorAccount: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../lib/temporal.js", () => ({
  maybeStartExternalActionWorkflow: vi.fn(async () => ({ started: false })),
}));

import { gmailRoutes } from "./gmail.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb(opts?: { existing?: any }) {
  const auditRows: any[] = [];
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionHash: "hash_1" };
  const account = { id: "ca_1", userId: "u1", connectorId: "google-gmail", status: "active" };
  const db = {
    auditRows,
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === approvals) return [approval];
            if (table === actionReceipts) return opts?.existing ? [opts.existing] : [];
            if (table === connectorAccounts) return [account];
            return [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: any) => {
        if (table === auditLog) auditRows.push(v);
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

const body = { accountId: "ca_1", to: ["a@example.com"], subject: "s", bodyText: "b", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_1" };

describe("gmail send audit (P4/P5 deterministic)", () => {
  beforeEach(() => { process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_FEEDBACK_ENABLED: "0" }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("audits idempotency key reuse conflict without provider call", async () => {
    const db = makeDb({ existing: { id: "rcpt_old", userId: "u1", approvalId: "apr_other", actionHash: "hash_1", status: "executed", externalRef: "m1" } });
    globalThis.fetch = vi.fn() as any;
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(409);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(db.auditRows).toEqual(expect.arrayContaining([expect.objectContaining({ action: "gmail.send.idempotency_conflict", decision: "deny" })]));
  });

  it("audits uncertain network outcome", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); }) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(503);
    expect(db.auditRows).toEqual(expect.arrayContaining([expect.objectContaining({ action: "gmail.send.uncertain", decision: "deny" })]));
  });

  it("audits uncertain provider 503 outcome", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "upstream" } }), { status: 503, headers: { "content-type": "application/json" } })) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(503);
    expect(db.auditRows).toEqual(expect.arrayContaining([expect.objectContaining({ action: "gmail.send.uncertain", decision: "deny" })]));
  });

  it("audits terminal provider 400 failure", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400, headers: { "content-type": "application/json" } })) as any;
    const db = makeDb();
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(400);
    expect(db.auditRows).toEqual(expect.arrayContaining([expect.objectContaining({ action: "gmail.send.failed", decision: "deny" })]));
  });
});
