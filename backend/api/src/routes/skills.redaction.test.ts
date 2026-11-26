import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { skillsRoutes } from "./skills.js";

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }
function makeDb(rows: any[]) {
  return {
    select: () => ({ from: () => ({ where: () => thenable(rows), orderBy: () => ({ limit: async (n: number) => rows.slice(0, n) }) }) }),
    insert: () => ({ values: (v: any) => ({ returning: async () => [{ id: "skl_1", ...v }] }) }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => [{ id: "skl_1", ...v }] }) }) }),
  } as any;
}
function makeApp(db: any) { const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route("/v1/skills", skillsRoutes(db)); return app; }

describe("skills P8 redaction", () => {
  it("redacts sensitive/path fields in skill config", async () => {
    process.env.HELM_SKILLS_ENABLED = "1";
    const db = makeDb([{ id: "skl_1", userId: "u1", name: "s", description: "d", enabled: true, source: "local", config: { apiKey: "sk-live", nested: { token: "tok-1" }, path: "C:\\Users\\Tapas\\secret.txt", safe: "ok" }, createdAt: new Date(), updatedAt: new Date() }]);
    const res = await makeApp(db).request("/v1/skills");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.skills[0].config.apiKey).toBe("[REDACTED]");
    expect(body.skills[0].config.nested.token).toBe("[REDACTED]");
    expect(body.skills[0].config.path).toBe("[REDACTED_PATH]");
    expect(body.skills[0].config.safe).toBe("ok");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("sk-live");
    expect(serialized).not.toContain("tok-1");
    expect(serialized).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});
