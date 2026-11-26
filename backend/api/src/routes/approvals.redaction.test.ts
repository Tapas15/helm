import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { approvals } from "@helm/db";
import { approvalRoutes } from "./approvals.js";

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => thenable(value); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }

function makeDb(rows: any[]) {
  return {
    select: () => ({ from: (table: unknown) => ({ where: () => thenable(table === approvals ? rows : []), orderBy: () => ({ limit: async (n: number) => rows.slice(0, n) }) }) }),
  } as any;
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/approvals", approvalRoutes(db));
  return app;
}

describe("approvals P8 redaction", () => {
  it("redacts sensitive evidence fields in approval list", async () => {
    const db = makeDb([{ id: "apr_1", userId: "u1", taskId: "tsk_1", runId: "run_1", actionKind: "gmail.send", actionHash: "h", status: "pending", summary: "s", evidence: { apiKey: "sk-live-123", nested: { token: "tok-abc" }, path: "C:\\Users\\Tapas\\secret.txt", safe: "keep" }, requestedAt: new Date("2026-01-01T00:00:00Z") }]);
    const res = await makeApp(db).request("/v1/approvals");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.approvals[0].evidence.apiKey).toBe("[REDACTED]");
    expect(body.approvals[0].evidence.nested.token).toBe("[REDACTED]");
    expect(body.approvals[0].evidence.path).toBe("[REDACTED_PATH]");
    expect(body.approvals[0].evidence.safe).toBe("keep");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("sk-live-123");
    expect(serialized).not.toContain("tok-abc");
    expect(serialized).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});
