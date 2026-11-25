import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { skillsRoutes } from "../routes/skills.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function makeApp() {
  const db = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
    insert: () => ({ values: (v: any) => ({ returning: async () => [{ id: "skl_1", ...v }] }) }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => [{ id: "skl_1", ...v }] }) }) }),
  } as any;
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/skills", skillsRoutes(db));
  return app;
}

describe("skills routes (P7)", () => {
  it("reports self-improvement gate in status", async () => {
    process.env.HELM_SKILLS_ENABLED = "0";
    const res = await makeApp().request("/v1/skills/status");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.selfImprovement.allowed).toBe(false);
    expect(body.selfImprovement.requiresExplicitApproval).toBe(true);
  });

  it("rejects writes when disabled", async () => {
    process.env.HELM_SKILLS_ENABLED = "0";
    const res = await makeApp().request("/v1/skills", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) });
    expect(res.status).toBe(403);
  });
});
