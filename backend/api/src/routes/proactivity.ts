import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { auditLog, proactivityRules, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });
const SENSITIVE_KEYS = new Set(["authorization", "cookie", "set-cookie", "password", "passwd", "secret", "token", "accesstoken", "refreshtoken", "apikey", "credential", "credentials", "privatekey", "clientsecret", "sessiontoken", "vaultkey", "encryptedvalue", "pkceverifier", "pkceverifierencrypted"]);
const redactValue = (value: unknown, keyHint = ""): unknown => {
  const lower = keyHint.toLowerCase();
  if (SENSITIVE_KEYS.has(lower)) return "[REDACTED]";
  if (lower.includes("path") && typeof value === "string" && (/^[/\\]/.test(value) || /^[A-Za-z]:[\\/]/.test(value))) return "[REDACTED_PATH]";
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactValue(v, k)]));
  return value;
};
const safeRule = (row: any) => row ? ({ ...row, triggerConfig: redactValue(row.triggerConfig ?? {}), actionConfig: redactValue(row.actionConfig ?? {}) }) : row;

async function writeProactivityAudit(db: Database, input: { userId: string; action: string; resourceId?: string | null; metadata?: Record<string, unknown> }) {
  try {
    await db.insert(auditLog).values({
      id: uid("aud"), userId: input.userId, ts: new Date(), actorType: "user", actorId: input.userId,
      action: input.action, resourceType: "proactivity_rule", resourceId: input.resourceId ?? null,
      decision: "allow", reason: null, metadata: input.metadata ?? {},
    });
  } catch {
    // Audit must not change proactivity behavior.
  }
}

export function proactivityRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const enabled = () => process.env.HELM_PROACTIVITY_ENABLED === "1";
  const dryRunEnabled = () => process.env.HELM_PROACTIVITY_DRY_RUN === "1";

  app.get("/status", (c) => c.json({ ok: true, enabled: enabled(), dryRunEnabled: dryRunEnabled(), execution: "disabled-by-default", note: "Rules can be stored when enabled; autonomous execution requires explicit activation design. Dry-run reports candidates only." }));

  app.get("/rules", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proactivity disabled (HELM_PROACTIVITY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(proactivityRules).where(eq(proactivityRules.userId, userId)).orderBy(desc(proactivityRules.updatedAt)).limit(100);
    return c.json({ ok: true, rules: rows.map(safeRule) });
  });

  app.post("/rules", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proactivity disabled (HELM_PROACTIVITY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "name required"), 400);
    const actionKind = typeof body?.actionKind === "string" ? body.actionKind.slice(0, 50) : "draft";
    if (actionKind !== "draft") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Only draft proactivity actions are allowed in this slice; autonomous/external execution requires explicit approval and activation"), 403);
    const now = new Date();
    const [row] = await db.insert(proactivityRules).values({ id: uid("prv"), userId, name, enabled: body?.enabled === true, triggerKind: typeof body?.triggerKind === "string" ? body.triggerKind.slice(0, 50) : "cron", triggerConfig: typeof body?.triggerConfig === "object" && body.triggerConfig ? body.triggerConfig : {}, actionKind: "draft", actionConfig: typeof body?.actionConfig === "object" && body.actionConfig ? body.actionConfig : {}, requireApproval: body?.requireApproval !== false, createdAt: now, updatedAt: now }).returning();
    return c.json({ ok: true, rule: safeRule(row) }, 201);
  });

  app.patch("/rules/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proactivity disabled (HELM_PROACTIVITY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({} as any));
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
    if (typeof body?.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body?.triggerKind === "string") patch.triggerKind = body.triggerKind.slice(0, 50);
    if (typeof body?.triggerConfig === "object" && body.triggerConfig) patch.triggerConfig = body.triggerConfig;
    if (typeof body?.actionKind === "string") {
      const actionKind = body.actionKind.slice(0, 50);
      if (actionKind !== "draft") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Only draft proactivity actions are allowed in this slice; autonomous/external execution requires explicit approval and activation"), 403);
      patch.actionKind = "draft";
    }
    if (typeof body?.actionConfig === "object" && body.actionConfig) patch.actionConfig = body.actionConfig;
    if (typeof body?.requireApproval === "boolean") patch.requireApproval = body.requireApproval;
    const [row] = await db.update(proactivityRules).set(patch).where(and(eq(proactivityRules.id, id), eq(proactivityRules.userId, userId))).returning();
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Rule not found"), 404);
    return c.json({ ok: true, rule: safeRule(row) });
  });

  app.get("/dry-run", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proactivity disabled (HELM_PROACTIVITY_ENABLED!=1)"), 403);
    if (!dryRunEnabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proactivity dry-run disabled (HELM_PROACTIVITY_DRY_RUN!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(proactivityRules).where(eq(proactivityRules.userId, userId)).orderBy(desc(proactivityRules.updatedAt)).limit(100);
    const candidates = rows
      .filter((r) => r.enabled === true && r.actionKind === "draft")
      .map((r) => ({ ruleId: r.id, name: r.name, triggerKind: r.triggerKind, actionKind: r.actionKind, requireApproval: r.requireApproval, wouldExecute: false, reason: "dry-run-only-draft" }));
    const unsafeBlocked = rows.filter((r) => r.actionKind !== "draft").map((r) => ({ ruleId: r.id, actionKind: r.actionKind, blocked: true, reason: "non-draft-action-kind" }));
    await writeProactivityAudit(db, { userId, action: "proactivity.dry_run", metadata: { scanned: rows.length, candidates: candidates.length, unsafeBlocked: unsafeBlocked.length, dryRun: true, executed: 0 } });
    return c.json({ ok: true, dryRun: true, executed: 0, scanned: rows.length, candidates, unsafeBlocked, note: "Dry-run only. No proactivity actions were executed." });
  });

  return app;
}
