import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { connectorAccounts } from "@helm/db";

vi.mock("../lib/vault.js", () => ({
  DbCredentialBroker: class { async getSecretValue() { return JSON.stringify({ access_token: "tok", refresh_token: "rtok", scope: "gmail.read", obtained_at: Date.now(), expires_in: 3600 }); } },
}));
vi.mock("../lib/oauth.js", () => ({
  isGoogleTokenExpired: () => false,
  refreshGoogleAccessToken: vi.fn(),
}));

import { connectorAccountRoutes } from "./connector-accounts.js";

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }
function makeDb() {
  const account = { id: "conn_1", userId: "u1", connectorId: "google-gmail", status: "active", scopes: ["gmail.read"], metadata: { accessToken: "should-not-leak" }, updatedAt: new Date() };
  return { select: () => ({ from: (t: any) => ({ where: () => thenable(t === connectorAccounts ? [account] : []) }) }) } as any;
}
function makeApp(db: any) { const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route("/v1/connector-accounts", connectorAccountRoutes(db)); return app; }

describe("connector-accounts P8 redaction", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ emailAddress: "a@b.com", messagesTotal: 1, accessToken: "tok-leak", path: "C:\\Users\\Tapas\\secret.txt" }), { status: 200, headers: { "content-type": "application/json" } })) as any; });
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it("redacts sensitive/path fields in status response", async () => {
    const res = await makeApp(makeDb()).request("/v1/connector-accounts/conn_1/status");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(JSON.stringify(body)).not.toContain("should-not-leak");
  });

  it("redacts sensitive/path fields in test profile response", async () => {
    const res = await makeApp(makeDb()).request("/v1/connector-accounts/conn_1/test", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.profile.emailAddress).toBe("a@b.com");
    expect(JSON.stringify(body)).not.toContain("tok-leak");
    expect(JSON.stringify(body)).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});
