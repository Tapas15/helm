import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { auditLog, evalCases, feedbackEvents, selfImprovementProposals, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { redactSensitive } from "../lib/redaction.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
const KIND = new Set(["task_outcome", "approval_decision", "tool_failure", "user_correction", "model_quality", "eval_result"]);
const SIGNAL = new Set(["positive", "negative", "neutral"]);
const SEVERITY = new Set(["info", "warn", "error"]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}…[TRUNCATED]` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const redacted = redactSensitive(value) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(redacted).slice(0, 100)) out[k] = redact(v, depth + 1);
    return out;
  }
  return value;
}
function safeEvent(r: any) { return r ? { ...r, payload: redact(r.payload ?? {}), evidenceRefs: redact(r.evidenceRefs ?? []) } : r; }
function safeEvalCase(r: any) { return r ? { ...r, input: redact(r.input ?? {}), expected: redact(r.expected ?? {}), metadata: redact(r.metadata ?? {}) } : r; }
function safeProposal(r: any) { return r ? { ...r, payload: redact(r.payload ?? {}), evidenceRefs: redact(r.evidenceRefs ?? []) } : r; }

async function writeFeedbackAudit(db: Database, input: { userId: string; action: string; resourceId?: string | null; metadata?: Record<string, unknown> }) {
  try {
    await db.insert(auditLog).values({
      id: uid("aud"), userId: input.userId, ts: new Date(), actorType: "user", actorId: input.userId,
      action: input.action, resourceType: "self_improvement_proposal", resourceId: input.resourceId ?? null,
      decision: "allow", reason: null, metadata: input.metadata ?? {},
    });
  } catch {
    // Audit must not change feedback/proposal behavior.
  }
}

const REVIEW_STATUS = new Set(["pending", "in_review", "approved_for_eval", "rejected", "changes_requested"]);
const EVAL_GATE_STATUS = new Set(["not_run", "pending", "passed", "failed", "waived"]);

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
    return c.json({ ok: true, event: safeEvent(row) }, 201);
  });

  app.get("/events", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const taskId = c.req.query("taskId");
    const where = taskId ? and(eq(feedbackEvents.userId, userId), eq(feedbackEvents.taskId, taskId)) : eq(feedbackEvents.userId, userId);
    const rows = await db.select().from(feedbackEvents).where(where).orderBy(desc(feedbackEvents.createdAt)).limit(100);
    return c.json({ ok: true, events: rows.map(safeEvent) });
  });

  app.post("/eval-cases/from-event/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const rows = await db.select().from(feedbackEvents).where(and(eq(feedbackEvents.id, id), eq(feedbackEvents.userId, userId))).limit(1);
    const fb = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!fb || typeof fb.id !== "string") return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Feedback event not found"), 404);
    const body = await c.req.json().catch(() => ({} as any));
    const now = new Date();
    const [row] = await db.insert(evalCases).values({
      id: uid("eval"), userId, sourceFeedbackId: fb.id,
      name: typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 160) : `regression-${fb.kind}-${String(fb.id ?? "").slice(-8)}`,
      kind: typeof body?.kind === "string" ? body.kind.slice(0, 40) : "regression",
      input: (redact(body?.input ?? { feedbackEventId: fb.id, kind: fb.kind }) as Record<string, unknown>),
      expected: (redact(body?.expected ?? { noRegression: true }) as Record<string, unknown>),
      status: "draft",
      metadata: { generatedFrom: "feedback_event", feedbackKind: fb.kind, signal: fb.signal, redacted: true },
      createdAt: now, updatedAt: now,
    }).returning();
    return c.json({ ok: true, evalCase: safeEvalCase(row) }, 201);
  });

  app.get("/eval-cases", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(evalCases).where(eq(evalCases.userId, userId)).orderBy(desc(evalCases.updatedAt)).limit(100);
    return c.json({ ok: true, evalCases: rows.map(safeEvalCase) });
  });

  app.post("/proposals/draft", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    if (process.env.HELM_FEEDBACK_PROPOSALS_ENABLED !== "1") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback proposals disabled (HELM_FEEDBACK_PROPOSALS_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const sourceFeedbackId = typeof body?.sourceFeedbackId === "string" ? body.sourceFeedbackId : null;
    const sourceEvalCaseId = typeof body?.sourceEvalCaseId === "string" ? body.sourceEvalCaseId : null;
    if (!sourceFeedbackId && !sourceEvalCaseId) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "sourceFeedbackId or sourceEvalCaseId required"), 400);

    let fb: any = null;
    let ev: any = null;
    if (sourceFeedbackId) {
      const [row] = await db.select().from(feedbackEvents).where(and(eq(feedbackEvents.id, sourceFeedbackId), eq(feedbackEvents.userId, userId))).limit(1);
      fb = row ?? null;
      if (!fb) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Feedback event not found"), 404);
    }
    if (sourceEvalCaseId) {
      const [row] = await db.select().from(evalCases).where(and(eq(evalCases.id, sourceEvalCaseId), eq(evalCases.userId, userId))).limit(1);
      ev = row ?? null;
      if (!ev) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Eval case not found"), 404);
    }

    const now = new Date();
    const title = typeof body?.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 160)
      : `draft-${ev?.kind ?? fb?.kind ?? "improvement"}-${String(sourceEvalCaseId ?? sourceFeedbackId ?? "").slice(-8)}`;
    const [row] = await db.insert(selfImprovementProposals).values({
      id: uid("sip"), userId, sourceFeedbackId, sourceEvalCaseId,
      kind: typeof body?.kind === "string" ? body.kind.slice(0, 40) : "prompt_tuning",
      title,
      summary: typeof body?.summary === "string" ? body.summary.slice(0, 1000) : (fb ? `Draft proposal from feedback ${fb.kind}/${fb.signal}` : `Draft proposal from eval case ${ev?.name ?? sourceEvalCaseId}`),
      status: "draft",
      riskLevel: typeof body?.riskLevel === "string" ? body.riskLevel.slice(0, 20) : "low",
      requiresApproval: true,
      activation: "blocked",
      reviewStatus: "pending",
      evalGateStatus: "not_run",
      reviewNote: null,
      reviewedAt: null,
      reviewedBy: null,
      payload: (redact(body?.payload ?? { sourceFeedbackId, sourceEvalCaseId, feedbackKind: fb?.kind ?? null, evalKind: ev?.kind ?? null }) as Record<string, unknown>),
      evidenceRefs: Array.isArray(body?.evidenceRefs) ? (redact(body.evidenceRefs.slice(0, 50)) as unknown[]) : [],
      createdAt: now, updatedAt: now,
    }).returning();
    await writeFeedbackAudit(db, { userId, action: "proposal.draft.created", resourceId: row?.id ?? null, metadata: { status: "draft", activation: "blocked", requiresApproval: true, reviewStatus: "pending", evalGateStatus: "not_run", sourceFeedbackId, sourceEvalCaseId } });
    return c.json({ ok: true, proposal: safeProposal(row), note: "Draft-only. No apply/activation path exists." }, 201);
  });

  app.get("/proposals", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    if (process.env.HELM_FEEDBACK_PROPOSALS_ENABLED !== "1") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback proposals disabled (HELM_FEEDBACK_PROPOSALS_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(selfImprovementProposals).where(eq(selfImprovementProposals.userId, userId)).orderBy(desc(selfImprovementProposals.updatedAt)).limit(100);
    return c.json({ ok: true, proposals: rows.map(safeProposal) });
  });

  app.get("/proposals/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    if (process.env.HELM_FEEDBACK_PROPOSALS_ENABLED !== "1") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback proposals disabled (HELM_FEEDBACK_PROPOSALS_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(selfImprovementProposals).where(and(eq(selfImprovementProposals.id, id), eq(selfImprovementProposals.userId, userId))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Proposal not found"), 404);
    return c.json({ ok: true, proposal: safeProposal(row) });
  });

  app.patch("/proposals/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback disabled (HELM_FEEDBACK_ENABLED!=1)"), 403);
    if (process.env.HELM_FEEDBACK_PROPOSALS_ENABLED !== "1") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Feedback proposals disabled (HELM_FEEDBACK_PROPOSALS_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [existing] = await db.select().from(selfImprovementProposals).where(and(eq(selfImprovementProposals.id, id), eq(selfImprovementProposals.userId, userId))).limit(1);
    if (!existing) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Proposal not found"), 404);
    const body = await c.req.json().catch(() => ({} as any));
    if (body?.status !== undefined && body.status !== "draft") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proposal status cannot move out of draft in this slice"), 403);
    if (body?.activation !== undefined && body.activation !== "blocked") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proposal activation is blocked until explicit approval"), 403);
    if (body?.requiresApproval !== undefined && body.requiresApproval !== true) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proposal requiresApproval cannot be disabled"), 403);
    if (body?.reviewStatus !== undefined && (typeof body.reviewStatus !== "string" || !REVIEW_STATUS.has(body.reviewStatus))) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "invalid reviewStatus"), 400);
    if (body?.evalGateStatus !== undefined && (typeof body.evalGateStatus !== "string" || !EVAL_GATE_STATUS.has(body.evalGateStatus))) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "invalid evalGateStatus"), 400);

    const reviewStatus = typeof body?.reviewStatus === "string" ? body.reviewStatus : (existing.reviewStatus ?? "pending");
    const evalGateStatus = typeof body?.evalGateStatus === "string" ? body.evalGateStatus : (existing.evalGateStatus ?? "not_run");
    const reviewNote = body?.reviewNote === null ? null : typeof body?.reviewNote === "string" ? body.reviewNote.slice(0, 2000) : (existing.reviewNote ?? null);
    const reviewFieldsTouched = body?.reviewStatus !== undefined || body?.evalGateStatus !== undefined || body?.reviewNote !== undefined || body?.reviewedBy !== undefined;
    const reviewedAt = reviewFieldsTouched ? new Date() : (existing.reviewedAt ?? null);
    const reviewedBy = typeof body?.reviewedBy === "string" && body.reviewedBy.trim() ? body.reviewedBy.trim().slice(0, 120) : (reviewFieldsTouched ? userId : (existing.reviewedBy ?? null));

    const patch: Record<string, unknown> = {
      updatedAt: new Date(), status: "draft", activation: "blocked", requiresApproval: true,
      reviewStatus, evalGateStatus, reviewNote, reviewedAt, reviewedBy,
    };
    if (typeof body?.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 160);
    if (typeof body?.summary === "string") patch.summary = body.summary.slice(0, 1000);
    if (typeof body?.riskLevel === "string") patch.riskLevel = body.riskLevel.slice(0, 20);
    if (typeof body?.kind === "string") patch.kind = body.kind.slice(0, 40);
    if (body?.payload !== undefined) patch.payload = redact(body.payload) as Record<string, unknown>;
    if (Array.isArray(body?.evidenceRefs)) patch.evidenceRefs = redact(body.evidenceRefs.slice(0, 50)) as unknown[];
    const [row] = await db.update(selfImprovementProposals).set(patch).where(and(eq(selfImprovementProposals.id, id), eq(selfImprovementProposals.userId, userId))).returning();
    await writeFeedbackAudit(db, { userId, action: "proposal.draft.updated", resourceId: row?.id ?? id, metadata: { status: "draft", activation: "blocked", requiresApproval: true, reviewStatus, evalGateStatus, fields: Object.keys(patch).filter((k) => k !== "updatedAt") } });
    return c.json({ ok: true, proposal: safeProposal(row), note: "Draft-only. Activation remains blocked; review/eval metadata does not activate proposals." });
  });
  return app;
}
