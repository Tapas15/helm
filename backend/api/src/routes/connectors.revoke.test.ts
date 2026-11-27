import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

const env = { ...process.env };
const realFetch = globalThis.fetch;

function makeDb(account: any) {
  const audits: any[] = [];
  const updates: any[] = [];
  const thenable = (value: any) => { const p: any = Promise.resolve(value); p.catch = (fn: any) => Promise.resolve(value).catch(fn); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.returning = async () => Array.isArray(value) ? value : [value]; return p; };
  return {
    audits, updates,
    select: () => ({ from: () => ({ where: () => thenable(account ? [account] : []) }) }),
    update: () => ({ set: (v: any) => ({ where: () => { updates.push(v); Object.assign(account, v); return thenable([]); } }) }),
    insert: () => ({ values: (v: any) => { audits.push(v); return thenable([v]); } }),
  } as any;
}

vi.mock("../lib/vault.js", () => {
  class DbCredentialBroker { async getSecretValue() { return JSON.stringify({ refresh_token: "rt1" }); } async revokeSecret() { return { ok: true }; } async getSecretRef() { return null; } }
  return { DbCredentialBroker, encryptVaultValue: (s: string) => s, decryptVaultValue: (s: string) => s, saveGoogleToken: async () => {} };
});

describe("connector revoke hardening", () => {
  beforeEach(() => { process.env = { ...env }; });
  afterEach(() => { process.env = { ...env }; globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it("reports providerRevoked=false and revokeError when provider revoke fails", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_token", error_description: "bad token" }), { status: 400, headers: { "content-type": "application/json" } })) as any;
    const { connectorRoutes } = await import("./connectors.js");
    const db = makeDb({ id: "ca1", userId: "u1", connectorId: "google-gmail", status: "active", secretRefId: null, scopes: [], metadata: {}, createdAt: new Date(), updatedAt: new Date() });
    const app = new Hono();
    app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
    app.route("/v1/connectors", connectorRoutes(db));
    const res = await app.request("/v1/connectors/accounts/ca1/revoke", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.status).toBe("revoked");
    expect(json.providerRevoked).toBe(false);
    expect(String(json.revokeError)).toMatch(/bad token|invalid_token/);
  });
});
