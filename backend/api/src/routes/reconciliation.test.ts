import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { actionReceipts } from "@helm/db";

const { temporal, reconciliation } = vi.hoisted(() => ({
  temporal: {
    getTemporalReconciliationScheduleStatus: vi.fn(async () => ({ enabled: false, scheduleId: "helm-reconciliation-schedule", status: "missing", reason: "not_created" })),
    maybeStartReconciliationSchedule: vi.fn(async () => ({ ok: true, scheduleId: "helm-reconciliation-schedule", created: true })),
  },
  reconciliation: {
    reconcileUncertainReceipts: vi.fn(async () => ({ scanned: 1, reconciled: 0, failed: 0, skipped: 1, errors: [] })),
  },
}));

vi.mock("../lib/temporal.js", () => temporal);
vi.mock("../lib/reconciliation.js", () => reconciliation);

import { reconciliationRoutes } from "./reconciliation.js";

const env = { ...process.env };

function makeDb(opts?: { counts?: any; recent?: any[]; dryRunRows?: any[] }) {
  const counts = opts?.counts ?? { uncertain: 2, executed: 5, failed: 1 };
  const recent = opts?.recent ?? [{ id: "rcpt_1", actionKind: "gmail.send", createdAt: new Date("2026-11-26T00:00:00Z"), evidence: { lastReconcileAttemptAt: "2026-11-26T00:01:00Z", lastReconcileReason: "not_found" } }];
  const dryRunRows = opts?.dryRunRows ?? [{ id: "rcpt_2", actionKind: "gmail.send", idempotencyKey: "idem_1", createdAt: new Date("2026-11-26T00:00:00Z"), externalRef: null }];
  let selectCall = 0;
  const chain = (value: any, opts2?: { onOrderBy?: any }) => {
    let current = value;
    const c: any = {
      where: () => c,
      orderBy: () => { if (opts2?.onOrderBy !== undefined) current = opts2.onOrderBy; return c; },
      limit: async () => current,
      then: (resolve: any, reject: any) => Promise.resolve(current).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(current).catch(reject),
    };
    return c;
  };
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          selectCall += 1;
          if (table === actionReceipts && selectCall === 1) return chain([counts], { onOrderBy: dryRunRows });
          if (table === actionReceipts && selectCall === 2) return chain(recent);
          if (table === actionReceipts) return chain(dryRunRows);
          return chain([]);
        },
      }),
    }),
  } as any;
}

function makeApp(db: any, userId = "u1") {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", userId); await next(); });
  app.route("/v1/reconciliation", reconciliationRoutes(db));
  return app;
}

describe("reconciliation routes (P5 contracts)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_ALLOW_DEV_AUTH: "0", HELM_RECONCILIATION_ENABLED: "1", HELM_RECONCILIATION_INTERVAL_MS: "60000", HELM_RECONCILIATION_OLDER_THAN_MS: "60000", HELM_RECONCILIATION_LIMIT: "20" };
    vi.clearAllMocks();
  });
  afterEach(() => { process.env = { ...env }; });

  it("GET /status returns DB-canonical counts, policy, and temporal schedule", async () => {
    const res = await makeApp(makeDb()).request("/v1/reconciliation/status");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.enabled).toBe(true);
    expect(body.policy).toContain("no-blind-retry");
    expect(body.counts).toEqual({ uncertain: 2, executed: 5, failed: 1 });
    expect(body.recentUncertain[0]).toMatchObject({ id: "rcpt_1", actionKind: "gmail.send", lastReconcileReason: "not_found" });
    expect(body.temporalSchedule).toMatchObject({ scheduleId: "helm-reconciliation-schedule" });
    expect(temporal.getTemporalReconciliationScheduleStatus).toHaveBeenCalledTimes(1);
  });

  it("POST /run defaults to user scope and calls reconciliation service", async () => {
    const res = await makeApp(makeDb(), "usr_1").request("/v1/reconciliation/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 7, olderThanMs: 0 }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(reconciliation.reconcileUncertainReceipts).toHaveBeenCalledWith(expect.anything(), { limit: 7, olderThanMs: 0, userId: "usr_1" });
  });

  it("POST /run rejects scope=all when not in dev/internal mode", async () => {
    const res = await makeApp(makeDb(), "usr_1").request("/v1/reconciliation/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "all" }) });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error.code).toBe("FORBIDDEN");
    expect(reconciliation.reconcileUncertainReceipts).not.toHaveBeenCalled();
  });

  it("POST /run allows scope=all in dev/internal mode", async () => {
    process.env.HELM_ALLOW_DEV_AUTH = "1";
    const res = await makeApp(makeDb(), "usr_1").request("/v1/reconciliation/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "all", olderThanMs: 0 }) });
    expect(res.status).toBe(200);
    expect(reconciliation.reconcileUncertainReceipts).toHaveBeenCalledWith(expect.anything(), { limit: undefined, olderThanMs: 0, userId: undefined });
  });

  it("POST /dry-run returns candidates without calling reconciliation mutator", async () => {
    const res = await makeApp(makeDb(), "usr_1").request("/v1/reconciliation/dry-run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ olderThanMs: 0, limit: 10 }) });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toMatchObject({ ok: true, dryRun: true, scanned: 1 });
    expect(body.candidates).toHaveLength(1); expect(body.candidates[0].id).toBe("rcpt_2"); expect(body.candidates[0].actionKind).toBe("gmail.send");
    expect(reconciliation.reconcileUncertainReceipts).not.toHaveBeenCalled();
  });

  it("POST /schedule/ensure rejects when not in dev/internal mode", async () => {
    const res = await makeApp(makeDb()).request("/v1/reconciliation/schedule/ensure", { method: "POST" });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error.code).toBe("FORBIDDEN");
    expect(temporal.maybeStartReconciliationSchedule).not.toHaveBeenCalled();
  });

  it("POST /schedule/ensure starts/updates schedule and returns status in dev/internal mode", async () => {
    process.env.HELM_ALLOW_DEV_AUTH = "1";
    temporal.getTemporalReconciliationScheduleStatus.mockResolvedValueOnce({ enabled: true, scheduleId: "helm-reconciliation-schedule", status: "active", nextActionTimes: ["2026-11-26T05:15:00.000Z"] } as any);
    const res = await makeApp(makeDb()).request("/v1/reconciliation/schedule/ensure", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(body.scheduleId).toBe("helm-reconciliation-schedule");
    expect(body.status).toMatchObject({ status: "active" });
    expect(temporal.maybeStartReconciliationSchedule).toHaveBeenCalledTimes(1);
  });
});







