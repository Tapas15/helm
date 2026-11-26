import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { actionReceipts } from "@helm/db";
import { __resetTemporalStubForTests } from "../lib/temporal.js";
import { reconciliationRoutes } from "./reconciliation.js";

const env = { ...process.env };

function makeSafeDb() {
  let selectCall = 0;
  const counts = { uncertain: 1, executed: 2, failed: 0 };
  const recent = [{ id: "rcpt_1", actionKind: "gmail.send", createdAt: new Date("2026-11-26T00:00:00Z"), evidence: {} }];
  const chain = (value: any) => {
    const c: any = { where: () => c, orderBy: () => c, limit: async () => value, then: (r: any, j: any) => Promise.resolve(value).then(r, j), catch: (j: any) => Promise.resolve(value).catch(j) };
    return c;
  };
  return {
    select: () => ({ from: (table: unknown) => ({ where: () => { selectCall += 1; if (table === actionReceipts && selectCall === 1) return chain([counts]); return chain(recent); } }) }),
  } as any;
}

function makeApp(db: any, userId = "u1") {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", userId); await next(); });
  app.route("/v1/reconciliation", reconciliationRoutes(db));
  return app;
}

describe("reconciliation schedule routes (P5 stub-backed, no real Temporal)", () => {
  beforeEach(() => {
    process.env = { ...env, HELM_ALLOW_DEV_AUTH: "1", HELM_TEMPORAL_ENABLED: "1", HELM_TEMPORAL_MODE: "external-write", HELM_TEMPORAL_TEST_MODE: "stub", HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED: "1", HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ID: "helm-recon-int", HELM_RECONCILIATION_ENABLED: "1" };
    __resetTemporalStubForTests();
  });
  afterEach(() => { process.env = { ...env }; __resetTemporalStubForTests(); });

  it("GET /status reflects missing then active schedule after ensure; ensure is idempotent create-then-update", async () => {
    const app = makeApp(makeSafeDb());
    const before = await app.request("/v1/reconciliation/status");
    expect(before.status).toBe(200);
    const b = await before.json() as any;
    expect(b.temporalSchedule).toMatchObject({ scheduleId: "helm-recon-int", status: "missing" });

    const e1 = await app.request("/v1/reconciliation/schedule/ensure", { method: "POST" });
    expect(e1.status).toBe(200);
    const j1 = await e1.json() as any;
    expect(j1).toMatchObject({ ok: true, scheduleId: "helm-recon-int", created: true });
    expect(j1.status).toMatchObject({ status: "active" });

    const e2 = await app.request("/v1/reconciliation/schedule/ensure", { method: "POST" });
    expect(e2.status).toBe(200);
    const j2 = await e2.json() as any;
    expect(j2).toMatchObject({ ok: true, scheduleId: "helm-recon-int", created: false });
    expect(j2.status).toMatchObject({ status: "active" });

    const after = await app.request("/v1/reconciliation/status");
    const a = await after.json() as any;
    expect(a.temporalSchedule).toMatchObject({ scheduleId: "helm-recon-int", status: "active" });
  });

  it("POST /schedule/ensure rejects without dev auth and does not create schedule", async () => {
    process.env.HELM_ALLOW_DEV_AUTH = "0";
    const app = makeApp(makeSafeDb());
    const res = await app.request("/v1/reconciliation/schedule/ensure", { method: "POST" });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error.code).toBe("FORBIDDEN");
    const status = await app.request("/v1/reconciliation/status");
    const s = await status.json() as any;
    expect(s.temporalSchedule.status).toBe("missing");
  });

  it("status reports temporal_disabled reason after rollback flag off", async () => {
    const app = makeApp(makeSafeDb());
    process.env.HELM_TEMPORAL_ENABLED = "0";
    const res = await app.request("/v1/reconciliation/status");
    const body = await res.json() as any;
    expect(body.temporalSchedule).toMatchObject({ enabled: false, scheduleId: "helm-recon-int", reason: "temporal_disabled" });
  });

  it("schedule ensure/status expose stable shape across missing, active, and disabled states", async () => {
    const app = makeApp(makeSafeDb());

    const missing = await app.request("/v1/reconciliation/status");
    const m = await missing.json() as any;
    expect(m.temporalSchedule).toMatchObject({ enabled: true, scheduleId: "helm-recon-int", status: "missing" });
    expect(typeof m.temporalSchedule.scheduleId).toBe("string");

    const ensured = await app.request("/v1/reconciliation/schedule/ensure", { method: "POST" });
    const e = await ensured.json() as any;
    expect(e.ok).toBe(true);
    expect(e.status).toMatchObject({ enabled: true, scheduleId: "helm-recon-int", status: "active" });
    expect(e).toHaveProperty("created");

    process.env.HELM_TEMPORAL_ENABLED = "0";
    const disabled = await app.request("/v1/reconciliation/status");
    const d = await disabled.json() as any;
    expect(d.temporalSchedule).toMatchObject({ enabled: false, scheduleId: "helm-recon-int", reason: "temporal_disabled" });
    expect(d.temporalSchedule).toHaveProperty("scheduleId");
  });
});
