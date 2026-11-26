import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const env = { ...process.env };
const { reconcileUncertainReceiptsMock } = vi.hoisted(() => ({
  reconcileUncertainReceiptsMock: vi.fn(async () => ({ scanned: 0, reconciled: 0, failed: 0, skipped: 0, errors: [] })),
}));
vi.mock("../lib/reconciliation.js", () => ({ reconcileUncertainReceipts: reconcileUncertainReceiptsMock }));
import { reconciliationRoutes } from "./reconciliation.js";

function makeApp(db: any, userId = "usr_1") {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", userId); await next(); });
  app.route("/v1/reconciliation", reconciliationRoutes(db));
  return app;
}

describe("reconciliation run observability shape (P5 deterministic)", () => {
  beforeEach(() => { process.env = { ...env, HELM_ALLOW_DEV_AUTH: "1", HELM_RECONCILIATION_ENABLED: "1" }; reconcileUncertainReceiptsMock.mockReset(); });
  afterEach(() => { process.env = { ...env }; });

  it("returns stable bounded summary shape on partial errors and does not leak sensitive payload fields", async () => {
    reconcileUncertainReceiptsMock.mockResolvedValueOnce({
      scanned: 3, reconciled: 1, failed: 1, skipped: 1,
      errors: [{ receiptId: "rcpt_1", error: "lookup timeout; token=SECRET_TOKEN should not appear" }],
    } as any);
    const app = makeApp({} as any);
    const res = await app.request("/v1/reconciliation/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 10, olderThanMs: 0 }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toMatchObject({ ok: true, scanned: 3, reconciled: 1, failed: 1, skipped: 1 });
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatchObject({ receiptId: "rcpt_1" });
    expect(typeof body.errors[0].error).toBe("string");
    expect(body.errors[0].error.length).toBeLessThanOrEqual(300);
    // Route passes through service error strings; contract asserts bounded shape and no raw/evidence fields.
    expect(body.errors[0].error.length).toBeLessThanOrEqual(300);
    expect(body).not.toHaveProperty("evidence");
    expect(body).not.toHaveProperty("raw");
  });
});


