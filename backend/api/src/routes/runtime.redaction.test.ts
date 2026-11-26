import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { runtimeRoutes } from "./runtime.js";

function makeApp() { const app = new Hono(); app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); }); app.route("/v1/runtime", runtimeRoutes({} as any)); return app; }

describe("runtime P8 redaction", () => {
  it("redacts sensitive key-shaped fields from runtime config responses", async () => {
    const prev = { ...process.env };
    process.env.HELM_MODEL = "test-model";
    process.env.HELM_MODEL_PROVIDER = "openai-compatible";
    process.env.HELM_MODEL_BASE_URL = "https://example.test/v1";
    try {
      const res = await makeApp().request("/v1/runtime/config");
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.ok).toBe(true);
      expect(body.runtime.model).toBe("test-model");
      // Ensure no accidental secret-like env leak in output shape
      expect(JSON.stringify(body)).not.toContain("HELM_VAULT_MASTER_KEY");
    } finally {
      process.env = prev;
    }
  });
});
