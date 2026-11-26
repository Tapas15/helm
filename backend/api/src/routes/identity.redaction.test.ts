import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { identityRoutes } from "./identity.js";

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }
function makeDb() {
  const identity = { id: "idn_1", userId: "u1", class: "helm-owned", label: "Helm", email: "h@x.com", provider: "helm", scopes: [], status: "active", metadata: { token: "tok-secret", path: "C:\\Users\\Tapas\\secret.txt", safe: "ok" }, createdAt: new Date(), updatedAt: new Date() };
  return { select: () => ({ from: () => ({ where: () => thenable([identity]), orderBy: () => ({ limit: async () => [identity] }) }) }), insert: () => ({ values: () => ({ returning: async () => [identity], onConflictDoNothing: () => ({}) }) }) } as any;
}
function makeApp(db: any) { const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route("/v1/identities", identityRoutes(db)); return app; }

describe("identity P8 redaction", () => {
  it("redacts identity metadata in list/status responses", async () => {
    const db = makeDb();
    const res = await makeApp(db).request("/v1/identities");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.identities[0].metadata.token).toBe("[REDACTED]");
    expect(body.identities[0].metadata.path).toBe("[REDACTED_PATH]");
    expect(body.identities[0].metadata.safe).toBe("ok");
    const s = JSON.stringify(body);
    expect(s).not.toContain("tok-secret");
    expect(s).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});
