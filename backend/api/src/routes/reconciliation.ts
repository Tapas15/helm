import { Hono } from "hono";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { actionReceipts, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { reconcileUncertainReceipts } from "../lib/reconciliation.js";
import { getTemporalReconciliationScheduleStatus, maybeStartReconciliationSchedule } from "../lib/temporal.js";

const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
const SENSITIVE_KEYS = new Set(["authorization", "cookie", "set-cookie", "password", "passwd", "secret", "token", "accesstoken", "refreshtoken", "apikey", "credential", "credentials", "privatekey", "clientsecret", "sessiontoken", "vaultkey", "encryptedvalue", "pkceverifier", "pkceverifierencrypted"]);
const redactValue = (value: unknown, keyHint = ""): unknown => {
  const lower = keyHint.toLowerCase();
  if (SENSITIVE_KEYS.has(lower)) return "[REDACTED]";
  if (typeof value === "string" && (/^[/\\]/.test(value) || /^[A-Za-z]:[\\/]/.test(value))) {
    if (lower.includes("path") || lower.includes("dir") || lower.includes("file") || /[/\\]/.test(value)) return "[REDACTED_PATH]";
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactValue(v, k)]));
  return value;
};

export function reconciliationRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const enabled = () => process.env.HELM_RECONCILIATION_ENABLED === "1";

  app.get("/status", async (c) => {
    const userId = c.get("userId");
    const [counts] = await db.select({
      uncertain: sql<number>`count(*) filter (where ${actionReceipts.status} = 'uncertain')::int`,
      executed: sql<number>`count(*) filter (where ${actionReceipts.status} = 'executed')::int`,
      failed: sql<number>`count(*) filter (where ${actionReceipts.status} = 'failed')::int`,
    }).from(actionReceipts).where(eq(actionReceipts.userId, userId));
    const recent = await db.select().from(actionReceipts).where(and(eq(actionReceipts.userId, userId), eq(actionReceipts.status, "uncertain"))).orderBy(desc(actionReceipts.createdAt)).limit(10);
    const temporalSchedule = await getTemporalReconciliationScheduleStatus().catch((e) => ({ enabled: false, scheduleId: process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ID ?? "helm-reconciliation-schedule", status: "error", reason: e instanceof Error ? e.message.slice(0, 200) : String(e) }));
    return c.json({
      ok: true,
      enabled: enabled(),
      intervalMs: Number(process.env.HELM_RECONCILIATION_INTERVAL_MS ?? 60_000),
      olderThanMs: Number(process.env.HELM_RECONCILIATION_OLDER_THAN_MS ?? 60_000),
      limit: Number(process.env.HELM_RECONCILIATION_LIMIT ?? 20),
      policy: "no-blind-retry; lookup-before-fail; uncertain receipts only; DB-canonical",
      temporalSchedule,
      counts: counts ?? { uncertain: 0, executed: 0, failed: 0 },
      recentUncertain: recent.map((r) => {
        const evidence = (r.evidence as Record<string, unknown> | null) ?? {};
        return { id: r.id, actionKind: r.actionKind, createdAt: r.createdAt, lastReconcileAttemptAt: redactValue(evidence.lastReconcileAttemptAt, "lastReconcileAttemptAt"), lastReconcileReason: redactValue(evidence.lastReconcileReason, "lastReconcileReason") };
      }),
    });
  });

  app.post("/schedule/ensure", async (c) => {
    if (process.env.HELM_ALLOW_DEV_AUTH !== "1") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "schedule management requires internal/dev mode"), 403);
    const result = await maybeStartReconciliationSchedule();
    const status = await getTemporalReconciliationScheduleStatus().catch(() => null);
    return c.json({ ...result, ok: result.ok, status });
  });

  app.post("/run", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const limit = typeof body?.limit === "number" ? body.limit : undefined;
    const olderThanMs = typeof body?.olderThanMs === "number" ? body.olderThanMs : undefined;
    const scope = body?.scope === "all" ? "all" : "user";
    if (scope === "all" && process.env.HELM_ALLOW_DEV_AUTH !== "1") {
      return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "scope=all requires internal/dev mode"), 403);
    }
    const result = await reconcileUncertainReceipts(db, { limit, olderThanMs, userId: scope === "all" ? undefined : userId });
    return c.json({ ok: true, ...result });
  });

  app.post("/dry-run", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const limit = Number.isFinite(body?.limit) ? Math.min(Math.max(Math.floor(body.limit), 1), 100) : 20;
    const olderThanMs = Number.isFinite(body?.olderThanMs) ? Math.max(Math.floor(body.olderThanMs), 0) : 60_000;
    const cutoff = new Date(Date.now() - olderThanMs);
    const rows = await db.select().from(actionReceipts).where(and(eq(actionReceipts.userId, userId), eq(actionReceipts.status, "uncertain"), lt(actionReceipts.createdAt, cutoff))).orderBy(desc(actionReceipts.createdAt)).limit(limit);
    return c.json({ ok: true, dryRun: true, scanned: rows.length, candidates: rows.map((r) => ({ id: r.id, actionKind: r.actionKind, idempotencyKey: r.idempotencyKey, createdAt: r.createdAt, externalRef: r.externalRef })) });
  });

  return app;
}
