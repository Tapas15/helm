import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { proactivityRoutes } from "./proactivity.js";

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }
function makeDb(rows: any[]) {
  return {
    select: () => ({ from: (_table: unknown) => ({ where: () => thenable(rows), orderBy: () => ({ limit: async (n: number) => rows.slice(0, n) }) }) }),
    insert: () => ({ values: (v: any) => ({ returning: async () => [{ id: "prv_1", ...v }] }) }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => [{ id: "prv_1", ...v }] }) }) }),
  } as any;
}
function makeApp(db: any) { const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route("/v1/proactivity", proactivityRoutes(db)); return app; }

describe("proactivity P8 redaction", () => {
  it("redacts sensitive/path fields in rule configs", async () => {
    process.env.HELM_PROACTIVITY_ENABLED = "1";
    const db = makeDb([{ id: "prv_1", userId: "u1", name: "r", enabled: true, triggerKind: "cron", triggerConfig: { apiKey: "sk-live", path: "C:\\Users\\Tapas\\secret.txt" }, actionKind: "draft", actionConfig: { token: "tok-1", safe: "ok" }, requireApproval: true, createdAt: new Date(), updatedAt: new Date() }]);
    const res = await makeApp(db).request("/v1/proactivity/rules");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.rules[0].triggerConfig.apiKey).toBe("[REDACTED]");
    expect(body.rules[0].triggerConfig.path).toBe("[REDACTED_PATH]");
    expect(body.rules[0].actionConfig.token).toBe("[REDACTED]");
    expect(body.rules[0].actionConfig.safe).toBe("ok");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("sk-live");
    expect(serialized).not.toContain("tok-1");
    expect(serialized).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});
