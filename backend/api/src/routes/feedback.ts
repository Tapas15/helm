import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { evalCases, feedbackEvents, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
const KIND = new Set(["task_outcome", "approval_decision", "tool_failure", "user_correction", "model_quality", "eval_result"]);
const SIGNAL = new Set(["positive", "negative", "neutral"]);
const SEVERITY = new Set(["info", "warn", "error"]);

const SENSITIVE_KEY = /token|secret|password|authorization|cookie|api[_-]?key|private[_-]?key|vault/i;
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 100)) out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    return out;
  }
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}…[TRUNCATED]` : value;
  return value;
}

export function feedbackRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const enabled = () => process.env.HELM_FEEDBACK_ENABLED === "1";

  app.get("/status", (c) => c.json({ ok: true, enabled: enabled(), mode: "feedback+eval-corpus", autonomousActivation: false }));

  app.post("/events", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const kind = typeof body?.kind === "string" ? body.kind : "";
    const signal = typeof body?.signal === "string" ? body.signal : "";
    const severity = typeof body?.severity === "string" ? body.severity : "info";
    if (!KIND.has(kind)) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "invalid kind"), 400);
    if (!SIGNAL.has(signal)) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "invalid signal"), 400);
    if (!SEVERITY.has(severity)) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "invalid severity"), 400);
    const [row] = await db.insert(feedbackEvents).values({
      id: uid("fbk"), userId,
      taskId: typeof body?.taskId === "string" ? body.taskId : null,
      runId: typeof body?.runId === "string" ? body.runId : null,
      kind, signal, severity,
      payload: (redact(body?.payload ?? {}) as Record<string, unknown>),
      evidenceRefs: Array.isArray(body?.evidenceRefs) ? body.evidenceRefs.slice(0, 50) : [],
      redacted: true,
    }).returning();
    return c.json({ ok: true, event: row }, 201);
  });

  app.get("/events", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const taskId = c.req.query("taskId");
    const where = taskId ? and(eq(feedbackEvents.userId, userId), eq(feedbackEvents.taskId, taskId)) : eq(feedbackEvents.userId, userId);
    const rows = await db.select().from(feedbackEvents).where(where).orderBy(desc(feedbackEvents.createdAt)).limit(100);
    return c.json({ ok: true, events: rows });
  });

  app.post("/eval-cases/from-event/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [fb] = await db.select().from(feedbackEvents).where(and(eq(feedbackEvents.id, id), eq(feedbackEvents.userId, userId))).limit(1);
    if (!fb) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Feedback event not found"), 404);
    const body = await c.req.json().catch(() => ({} as any));
    const now = new Date();
    const [row] = await db.insert(evalCases).values({
      id: uid("eval"), userId, sourceFeedbackId: fb.id,
      name: typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 160) : `regression-${fb.kind}-${fb.id.slice(-8)}`,
      kind: typeof body?.kind === "string" ? body.kind.slice(0, 40) : "regression",
      input: (redact(body?.input ?? { feedbackEventId: fb.id, kind: fb.kind }) as Record<string, unknown>),
      expected: (redact(body?.expected ?? { noRegression: true }) as Record<string, unknown>),
      status: "draft",
      metadata: { generatedFrom: "feedback_event", feedbackKind: fb.kind, signal: fb.signal, redacted: true },
      createdAt: now, updatedAt: now,
    }).returning();
    return c.json({ ok: true, evalCase: row }, 201);
  });

  app.get("/eval-cases", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(evalCases).where(eq(evalCases.userId, userId)).orderBy(desc(evalCases.updatedAt)).limit(100);
    return c.json({ ok: true, evalCases: rows });
  });

  return app;
}