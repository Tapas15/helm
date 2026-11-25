import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { proactivityRoutes } from "../routes/proactivity.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function makeApp() {
  const db = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
    insert: () => ({ values: (v: any) => ({ returning: async () => [{ id: "prv_1", ...v }] }) }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => [{ id: "prv_1", ...v }] }) }) }),
  } as any;
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/proactivity", proactivityRoutes(db));
  return app;
}

describe("proactivity routes (P7)", () => {
  it("rejects non-draft actionKind", async () => {
    process.env.HELM_PROACTIVITY_ENABLED = "1";
    const res = await makeApp().request("/v1/proactivity/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "r1", actionKind: "external_send" }) });
    expect(res.status).toBe(403);
  });

  it("allows draft rule creation", async () => {
    process.env.HELM_PROACTIVITY_ENABLED = "1";
    const res = await makeApp().request("/v1/proactivity/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "r1", actionKind: "draft" }) });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.rule.actionKind).toBe("draft");
  });
  it("dry-run is forbidden when flag disabled", async () => {
    process.env.HELM_PROACTIVITY_ENABLED = "1";
    process.env.HELM_PROACTIVITY_DRY_RUN = "0";
    const res = await makeApp().request("/v1/proactivity/dry-run");
    expect(res.status).toBe(403);
  });

  it("dry-run returns draft candidates only and never executes", async () => {
    process.env.HELM_PROACTIVITY_ENABLED = "1";
    process.env.HELM_PROACTIVITY_DRY_RUN = "1";
    const rows = [
      { id: "prv_1", userId: "u1", name: "safe", enabled: true, triggerKind: "cron", actionKind: "draft", requireApproval: true },
      { id: "prv_2", userId: "u1", name: "unsafe", enabled: true, triggerKind: "cron", actionKind: "external_send", requireApproval: true },
      { id: "prv_3", userId: "u1", name: "disabled", enabled: false, triggerKind: "cron", actionKind: "draft", requireApproval: true },
    ];
    const auditRows: any[] = [];
    const db = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => rows }) }) }) }),
      insert: (_table: any) => ({ values: async (v: any) => { if (v?.action === "proactivity.dry_run") auditRows.push(v); return [v]; } }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    } as any;
    const app = new Hono();
    app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
    app.route("/v1/proactivity", proactivityRoutes(db));
    const res = await app.request("/v1/proactivity/dry-run");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.dryRun).toBe(true);
    expect(body.executed).toBe(0);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].ruleId).toBe("prv_1");
    expect(body.candidates[0].wouldExecute).toBe(false);
    expect(body.unsafeBlocked.some((r: any) => r.ruleId === "prv_2")).toBe(true);
    expect(auditRows.some((r: any) => r.action === "proactivity.dry_run" && r.metadata?.executed === 0)).toBe(true);
  });
});

