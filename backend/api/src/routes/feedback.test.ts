import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { evalCases, feedbackEvents } from "@helm/db";
import { feedbackRoutes } from "../routes/feedback.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

function makeDb(opts?: { events?: any[]; evals?: any[] }) {
  const events = opts?.events ?? [];
  const evals = opts?.evals ?? [];
  const rowsFor = (table: unknown) => (table === evalCases ? evals : table === feedbackEvents ? events : []);
  const query = (rows: any[]) => {
    const q: any = {
      where: () => q,
      orderBy: () => q,
      limit: async (n?: number) => (typeof n === "number" ? rows.slice(0, n) : rows),
    };
    return q;
  };
  return {
    events,
    evals,
    db: {
      select: () => ({ from: (table: unknown) => query(rowsFor(table)) }),
      insert: (table: unknown) => ({
        values: (v: any) => ({
          returning: async () => {
            const row = { id: v.id ?? "id_1", ...v };
            rowsFor(table).push(row);
            return [row];
          },
        }),
      }),
    } as any,
  };
}

function makeApp(db: any) {
  const app = new Hono();
  app.use("*", async (c, next) => { (c.set as any)("userId", "u1"); await next(); });
  app.route("/v1/feedback", feedbackRoutes(db));
  return app;
}

describe("feedback routes (P7a)", () => {
  it("rejects when disabled", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "0";
    const { db } = makeDb();
    const res = await makeApp(db).request("/v1/feedback/events");
    expect(res.status).toBe(403);
  });

  it("redacts sensitive payload keys and accepts valid event", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const { db, events } = makeDb();
    const res = await makeApp(db).request("/v1/feedback/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "tool_failure", signal: "negative", summary: "failed", payload: { sessionToken: "secret", ok: true } }),
    });
    expect(res.status).toBe(201);
    expect(events[0]?.payload?.sessionToken).toBe("[REDACTED]");
    expect(events[0]?.payload?.ok).toBe(true);
  });

  it("returns 404 when feedback event missing for eval case", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const { db } = makeDb({ events: [] });
    const res = await makeApp(db).request("/v1/feedback/eval-cases/from-event/fbk_missing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("creates draft eval case from existing feedback event", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const fb = { id: "fbk_12345678", userId: "u1", kind: "tool_failure", signal: "negative", payload: {}, createdAt: new Date() };
    const { db, evals } = makeDb({ events: [fb] });
    const res = await makeApp(db).request("/v1/feedback/eval-cases/from-event/fbk_12345678", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.evalCase.sourceFeedbackId).toBe("fbk_12345678");
    expect(body.evalCase.status).toBe("draft");
    expect(body.evalCase.metadata?.generatedFrom).toBe("feedback_event");
    expect(body.evalCase.metadata?.feedbackKind).toBe("tool_failure");
    expect(evals).toHaveLength(1);
  });

  it("rejects invalid kind", async () => {
    process.env.HELM_FEEDBACK_ENABLED = "1";
    const { db } = makeDb();
    const res = await makeApp(db).request("/v1/feedback/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "bad" }) });
    expect(res.status).toBe(400);
  });
});
