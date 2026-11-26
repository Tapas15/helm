import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { connectorAccounts } from "@helm/db";

vi.mock("./connector-accounts.js", () => ({ getValidGoogleAccessToken: vi.fn(async () => ({ token: "tok_test" })) }));
import { calendarRoutes } from "./calendar.js";

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }
function makeDb() {
  const account = { id: "ca_1", userId: "u1", connectorId: "google-calendar", status: "active" };
  return { select: () => ({ from: (t: any) => ({ where: () => thenable(t === connectorAccounts ? [account] : []) }) }), insert: () => ({ values: () => thenable([]) }) } as any;
}
function makeApp(db: any) { const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route("/v1/connectors/calendar", calendarRoutes(db)); return app; }

describe("calendar read P8 redaction", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ items: [{ id: "evt_1", summary: "ok", private: { accessToken: "tok-leak", path: "C:\\Users\\Tapas\\secret.txt" } }], nextPageToken: null }), { status: 200, headers: { "content-type": "application/json" } })) as any; });
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });
  it("redacts sensitive/path fields in events read response", async () => {
    const res = await makeApp(makeDb()).request("/v1/connectors/calendar/accounts/ca_1/events");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.events[0].summary).toBe("ok");
    const s = JSON.stringify(body);
    expect(s).not.toContain("tok-leak");
    expect(s).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});
