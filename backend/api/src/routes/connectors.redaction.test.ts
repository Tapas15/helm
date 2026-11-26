import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { connectorAccounts, identities, identityPolicies, vaultSecrets } from "@helm/db";
import { connectorRoutes } from "./connectors.js";
import { identityRoutes } from "./identity.js";

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }

function makeDb() {
  const account = { id: "conn_1", userId: "u1", connectorId: "google-gmail", status: "active", secretRefId: "sec_1", scopes: ["gmail.read"], metadata: { accessToken: "tok-secret", nested: { clientSecret: "cs-1" }, path: "C:\\Users\\Tapas\\secret.txt", safe: "keep" }, createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z") };
  const identity = { id: "idn_1", userId: "u1", class: "helm-owned", label: "Helm", email: "h@x.com", provider: "helm", scopes: [], status: "active", metadata: {}, createdAt: new Date(), updatedAt: new Date() };
  const policy = { id: "idp_1", userId: "u1", identityId: "idn_1", allowedDomains: [], allowedRecipients: [], allowExternalWrites: false, requireApproval: true, createdAt: new Date(), updatedAt: new Date() };
  return {
    select: () => ({ from: (table: any) => ({ where: () => thenable(table === vaultSecrets ? [] : table === identities ? [identity] : table === identityPolicies ? [policy] : table === connectorAccounts ? [account] : [account]), orderBy: () => ({ limit: async (n: number) => (table === connectorAccounts ? [account] : []).slice(0, n) }) }) }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => [{ ...account, ...v }] }) }) }),
    insert: () => ({ values: async () => [] }),
  } as any;
}

function makeApp(db: any, route: any, base: string) { const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route(base, route(db)); return app; }

describe("connector/identity P8 redaction", () => {
  it("redacts connector account metadata and omits secretRefId", async () => {
    const db = makeDb();
    const res = await makeApp(db, connectorRoutes, "/v1/connectors").request("/v1/connectors/accounts");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.accounts[0].metadata.accessToken).toBe("[REDACTED]");
    expect(body.accounts[0].metadata.nested.clientSecret).toBe("[REDACTED]");
    expect(body.accounts[0].metadata.path).toBe("[REDACTED_PATH]");
    expect(body.accounts[0].secretRefId).toBeUndefined();
    const s = JSON.stringify(body);
    expect(s).not.toContain("tok-secret");
    expect(s).not.toContain("cs-1");
    expect(s).not.toContain("sec_1");
    expect(s).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });

  it("redacts connector account metadata in identity bind response", async () => {
    const db = makeDb();
    const res = await makeApp(db, identityRoutes, "/v1/identities").request("/v1/identities/idn_1/bind-connector-account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: "conn_1" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.account.metadata.accessToken).toBe("[REDACTED]");
    expect(body.account.secretRefId).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("tok-secret");
    expect(JSON.stringify(body)).not.toContain("sec_1");
  });
});
