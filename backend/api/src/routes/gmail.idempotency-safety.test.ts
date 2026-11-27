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

import { gmailRoutes } from "./gmail.js";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb(existing: any) {
  const approval = { id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", status: "approved", actionHash: "hash_1" };
  const account = { id: "ca_1", userId: "u1", connectorId: "google-gmail", status: "active" };
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === approvals) return [approval];
            if (table === actionReceipts) return existing ? [existing] : [];
            if (table === connectorAccounts) return [account];
            return [];
          },
        }),
      }),
    }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  } as any;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/connectors/gmail", gmailRoutes(db));
  return app;
}

const body = { accountId: "ca_1", to: ["a@example.com"], subject: "s", bodyText: "b", approvalId: "apr_1", actionHash: "hash_1", idempotencyKey: "idem_1" };

describe("gmail send idempotency safety (P4/P5 deterministic)", () => {
  beforeEach(() => { process.env = { ...env, HELM_TEMPORAL_MODE: "off", HELM_FEEDBACK_ENABLED: "0" }; globalThis.fetch = vi.fn() as any; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.clearAllMocks(); });

  it("returns 409 when idempotency key is reused with different action hash", async () => {
    const db = makeDb({ id: "rcpt_old", userId: "u1", approvalId: "apr_1", actionHash: "hash_other", status: "executed", externalRef: "msg_old" });
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(409);
    const json = await res.json() as any;
    expect(json.error.code).toBe("CONFLICT");
    expect(json.error.message).toMatch(/Idempotency key reused/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns 409 when idempotency key is reused with different approval", async () => {
    const db = makeDb({ id: "rcpt_old", userId: "u1", approvalId: "apr_other", actionHash: "hash_1", status: "executed", externalRef: "msg_old" });
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(409);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("dedupes when same idempotency key matches same user/action/approval and is executed", async () => {
    const db = makeDb({ id: "rcpt_old", userId: "u1", approvalId: "apr_1", actionHash: "hash_1", status: "executed", externalRef: "msg_old" });
    const res = await makeApp(db).request("/v1/connectors/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json).toMatchObject({ ok: true, deduped: true, receiptId: "rcpt_old", externalRef: "msg_old" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
