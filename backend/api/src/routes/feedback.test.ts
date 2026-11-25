import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { feedbackRoutes } from "../routes/feedback.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function makeApp(opts?: { events?: any[]; evals?: any[] }) {
  const events = opts?.events ?? [];
  const evals = opts?.evals ?? [];
  const db = {
    select: () => ({
      from: (table: any) => {
        const tname = String((table as any)?.[Symbol.for("drizzle:Name")] ?? (table as any)?._?.name ?? (table as any)?.dbName ?? "");
        const isEval = tname.includes("eval") || tname === "eval_cases";
        const rows = isEval ? evals : events;
        const q: any = {
          where: () => q,
          orderBy: () => q,
          limit: async () => rows,
        };
        return q;
      },
    }),
    insert: (table: any) => ({
      values: (v: any) => ({
        returning: async () => {
          const row = { id: v.id ?? "id_1", ...v };
          const tname = String((table as any)?.[Symbol.for("drizzle:Name")] ?? (table as any)?._?.name ?? (table as any)?.dbName ?? "");
          if (tname.includes("eval") || "sourceFeedbackId" in v) evals.push(row);
          else events.push(row);
          return [row];
        },
      }),
    }),
  } as any;
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/feedback", feedbackRoutes(db));
  return app;
}

describe("feedback routes (P7a)", () => {
  it("rejects when disabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const res = await makeApp().request("/v1/feedback/events");
    expect(res.status).toBe(403);
  });

  it("redacts sensitive payload keys and accepts valid event", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const res = await makeApp().request("/v1/feedback/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "tool_failure", signal: "negative", severity: "warn", payload: { token: "abc", nested: { password: "x" }, ok: "y" } }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.event.payload.token).toBe("[REDACTED]");
    expect(body.event.payload.nested.password).toBe("[REDACTED]");
    expect(body.event.payload.ok).toBe("y");
    expect(body.event.redacted).toBe(true);
  });
});
