import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { reconciliationRoutes } from "./reconciliation.js";

function thenable(value: any) { const p: any = Promise.resolve(value); p.limit = async (n?: number) => Array.isArray(value) ? value.slice(0, n ?? value.length) : value; p.orderBy = () => ({ limit: async (n: number) => Array.isArray(value) ? value.slice(0, n) : value }); p.where = () => thenable(value); p.returning = async () => Array.isArray(value) ? value : [value]; return p; }
function makeDb() {
  const receipt = { id: "rcpt_1", actionKind: "gmail.send", createdAt: new Date("2026-01-01T00:00:00Z"), evidence: { lastReconcileAttemptAt: "2026-01-01T00:00:00Z", lastReconcileReason: "C:\\Users\\Tapas\\secret.txt" } };
  return { select: () => ({ from: () => ({ where: () => thenable([{ uncertain: 1, executed: 0, failed: 0 }]) }) }) } as any;
}

describe("reconciliation P8 redaction", () => {
  it("redacts path-shaped reconcile reason in status", async () => {
    // Directly test route via custom app with a mock that serves both count and recent queries
    const receipt = { id: "rcpt_1", actionKind: "gmail.send", createdAt: new Date("2026-01-01T00:00:00Z"), evidence: { lastReconcileAttemptAt: "2026-01-01T00:00:00Z", lastReconcileReason: "C:\\Users\\Tapas\\secret.txt" } };
    let call = 0;
    const db: any = {
      select: () => ({ from: () => ({ where: () => { call++; return call === 1 ? thenable([{ uncertain: 1, executed: 0, failed: 0 }]) : ({ orderBy: () => ({ limit: async () => [receipt] }) }); } }) }),
    };
    const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route("/v1/reconciliation", reconciliationRoutes(db));
    const res = await app.request("/v1/reconciliation/status");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.recentUncertain[0].lastReconcileReason).toBe("[REDACTED_PATH]");
    expect(JSON.stringify(body)).not.toContain("C:\\\\Users\\\\Tapas\\\\secret.txt");
  });
});
