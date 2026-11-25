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
});
