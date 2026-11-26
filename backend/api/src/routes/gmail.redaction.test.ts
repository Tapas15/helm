import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { connectorAccounts } from "@helm/db";

vi.mock("./connector-accounts.js", () => ({ getValidGoogleAccessToken: vi.fn(async () => ({ token: "tok_test" })) }));
import { gmailRoutes } from "./gmail.js";

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }
function makeDb() {
  const account = { id: "ca_1", userId: "u1", connectorId: "google-gmail", status: "active" };
  return { select: () => ({ from: (t: any) => ({ where: () => thenable(t === connectorAccounts ? [account] : []) }) }), insert: () => ({ values: () => thenable([]) }) } as any;
}
function makeApp(db: any) { const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route("/v1/connectors/gmail", gmailRoutes(db)); return app; }

describe("gmail read P8 redaction", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "m1", threadId: "t1", accessToken: "tok-leak", path: "C:\\Users\\Tapas\\secret.txt" }], nextPageToken: null }), { status: 200, headers: { "content-type": "application/json" } })) as any; });
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });
  it("redacts sensitive/path fields in messages read response", async () => {
    const res = await makeApp(makeDb()).request("/v1/connectors/gmail/accounts/ca_1/messages");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.messages[0].id).toBe("m1");
    const s = JSON.stringify(body);
    expect(s).not.toContain("tok-leak");
    expect(s).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});
