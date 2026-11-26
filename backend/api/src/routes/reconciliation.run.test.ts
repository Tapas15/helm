import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts } from "@helm/db";

const env = { ...process.env };

const { reconcileUncertainReceiptsMock } = vi.hoisted(() => ({
  reconcileUncertainReceiptsMock: vi.fn(async () => ({ scanned: 0, reconciled: 0, failed: 0, skipped: 0, errors: [] })),
}));

vi.mock("../lib/reconciliation.js", () => ({
  reconcileUncertainReceipts: reconcileUncertainReceiptsMock,
}));

import { reconciliationRoutes } from "./reconciliation.js";

function makeApp(db: any, userId = "u1") {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", userId); await next(); });
  app.route("/v1/reconciliation", reconciliationRoutes(db));
  return app;
}

describe("reconciliation run route boundary (P5 deterministic)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_ALLOW_DEV_AUTH: "1", HELM_RECONCILIATION_ENABLED: "1" };
    reconcileUncertainReceiptsMock.mockClear();
  });
  afterEach(() => { process.env = { ...env }; });

  it("POST /run passes through repeated scheduled-style invocations and returns DB-canonical summary without provider writes", async () => {
    reconcileUncertainReceiptsMock
      .mockResolvedValueOnce({ scanned: 2, reconciled: 0, failed: 0, skipped: 2, errors: [] })
      .mockResolvedValueOnce({ scanned: 2, reconciled: 0, failed: 0, skipped: 2, errors: [] });
    const app = makeApp({} as any, "usr_1");
    const r1 = await app.request("/v1/reconciliation/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 20, olderThanMs: 0 }) });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ ok: true, scanned: 2, skipped: 2, reconciled: 0, failed: 0, errors: [] });
    const r2 = await app.request("/v1/reconciliation/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 20, olderThanMs: 0 }) });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ ok: true, scanned: 2, skipped: 2, reconciled: 0, failed: 0, errors: [] });
    expect(reconcileUncertainReceiptsMock).toHaveBeenCalledTimes(2);
    expect(reconcileUncertainReceiptsMock).toHaveBeenNthCalledWith(1, expect.anything(), { limit: 20, olderThanMs: 0, userId: "usr_1" });
    expect(reconcileUncertainReceiptsMock).toHaveBeenNthCalledWith(2, expect.anything(), { limit: 20, olderThanMs: 0, userId: "usr_1" });
  });

  it("POST /run dry-run remains read-only boundary (no mutator call) across repeated invocations", async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ id: "rcpt_1", actionKind: "gmail.send", idempotencyKey: "idem_1", createdAt: new Date("2026-11-26T00:00:00Z"), externalRef: null }] }) }) }) }),
    } as any;
    const app = makeApp(db, "usr_1");
    for (let i = 0; i < 2; i++) {
      const res = await app.request("/v1/reconciliation/dry-run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 10, olderThanMs: 0 }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, dryRun: true, scanned: 1 });
    }
    expect(reconcileUncertainReceiptsMock).not.toHaveBeenCalled();
  });
});
