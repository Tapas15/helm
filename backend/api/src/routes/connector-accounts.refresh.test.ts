import { describe, expect, it, vi } from "vitest";
import { connectorAccountRoutes } from "./connector-accounts.js";
import { Hono } from "hono";

function makeDb(account: any) {
  const thenable = (value: any) => { const p: any = Promise.resolve(value); p.catch = (fn: any) => Promise.resolve(value).catch(fn); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; return p; };
  return { select: () => ({ from: () => ({ where: () => thenable(account ? [account] : []) }) }) } as any;
}

describe("connector-accounts token refresh hardening", () => {
  it("does not return expired access token when refresh fails", async () => {
    const oldFetch = globalThis.fetch;
    const now = Date.now();
    const db = makeDb({ id: "ca1", userId: "u1", connectorId: "google-gmail", status: "active", scopes: [], updatedAt: new Date() });
    const vault = {
      getSecretValue: vi.fn(async () => JSON.stringify({ access_token: "old", refresh_token: "rt1", obtained_at: now - 7200_000, expires_in: 3600 })),
      putSecret: vi.fn(async () => ({})),
    } as any;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad refresh" }), { status: 400, headers: { "content-type": "application/json" } })));
    process.env.GOOGLE_CLIENT_ID = "cid"; process.env.GOOGLE_CLIENT_SECRET = "sec";
    const app = new Hono();
    app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
    app.route("/v1/connectors/accounts", connectorAccountRoutes(db));
    // override vault by monkeypatching module instance is hard; test getValidGoogleAccessToken directly instead
    const mod = await import("./connector-accounts.js");
    const res = await mod.getValidGoogleAccessToken(vault, "u1", "ca1");
    expect(res.token).toBeNull();
    expect(String(res.reason)).toMatch(/bad refresh|invalid_grant/);
    globalThis.fetch = oldFetch;
  });

  it("returns refreshed access token and persists merged token", async () => {
    const oldFetch = globalThis.fetch;
    const now = Date.now();
    const vault = {
      getSecretValue: vi.fn(async () => JSON.stringify({ access_token: "old", refresh_token: "rt1", obtained_at: now - 7200_000, expires_in: 3600, scope: "a b" })),
      putSecret: vi.fn(async () => ({})),
    } as any;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ access_token: "new_access", expires_in: 3600, token_type: "Bearer" }), { status: 200, headers: { "content-type": "application/json" } })));
    process.env.GOOGLE_CLIENT_ID = "cid"; process.env.GOOGLE_CLIENT_SECRET = "sec";
    const mod = await import("./connector-accounts.js");
    const res = await mod.getValidGoogleAccessToken(vault, "u1", "ca1");
    expect(res.token).toBe("new_access");
    expect(vault.putSecret).toHaveBeenCalledOnce();
    const saved = JSON.parse(vault.putSecret.mock.calls[0][0].value);
    expect(saved.access_token).toBe("new_access");
    expect(saved.refresh_token).toBe("rt1");
    expect(saved.scope).toBe("a b");
    globalThis.fetch = oldFetch;
  });
});
