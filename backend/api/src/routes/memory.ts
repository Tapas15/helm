import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { auditLog, memoryNotes, type Database } from "@helm/db";
import { HELM_ERROR_CODES, createMemoryRetrievalProvider } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { redactSensitive as redactSensitiveAny } from "../lib/redaction.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

const SENSITIVE_RE = /(api[_-]?key|secret|password|token|bearer|private key|vault|sk-[a-z0-9]|ghp_[a-z0-9]|AIza[0-9A-Za-z_-])/i;
type Provenance = "user_confirmed" | "observed" | "inferred";
type Sensitivity = "normal" | "sensitive" | "sensitive-redacted";
type RetentionPolicy = "user_controlled" | "ephemeral" | "session" | "indefinite";
const RETENTION_POLICIES: readonly RetentionPolicy[] = ["user_controlled", "ephemeral", "session", "indefinite"];

const PII_RE = /\b\d{3}-\d{2}-\d{4}\b|\b\d{12,19}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b|\b\d{1,5}\s+[A-Za-z0-9.\- ]+\s(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct)\b/i;
function redactSensitive(text: string): { content: string; redacted: boolean; sensitivity: Sensitivity; pii: "none" | "possible" | "redacted" } {
  if (SENSITIVE_RE.test(text)) return { content: "[REDACTED_SENSITIVE_MEMORY]", redacted: true, sensitivity: "sensitive-redacted", pii: "redacted" };
  if (PII_RE.test(text)) return { content: "[REDACTED_SENSITIVE_MEMORY]", redacted: true, sensitivity: "sensitive-redacted", pii: "redacted" };
  return { content: text, redacted: false, sensitivity: "normal", pii: "none" };
}
function clampConfidence(v: unknown, provenance: Provenance): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : provenance === "user_confirmed" ? 1 : provenance === "observed" ? 0.8 : 0.6;
  return provenance === "inferred" ? Math.min(n, 0.8) : n;
}

function normalizeRetention(v: unknown): { retentionPolicy: RetentionPolicy; expiresAt: string | null; pii: "none" | "possible" | "redacted" } {
  const obj = typeof v === "object" && v && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const retentionPolicy = RETENTION_POLICIES.includes(obj.retentionPolicy as RetentionPolicy) ? (obj.retentionPolicy as RetentionPolicy) : "user_controlled";
  const expiresAt = typeof obj.expiresAt === "string" && !Number.isNaN(Date.parse(obj.expiresAt)) ? new Date(obj.expiresAt).toISOString() : null;
  const pii = obj.pii === "possible" || obj.pii === "redacted" || obj.pii === "none" ? obj.pii : "none";
  return { retentionPolicy, expiresAt, pii };
}

function redactExportValue(value: unknown): unknown { return redactSensitiveAny(value); }

function noteMeta(existing: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const base = typeof existing === "object" && existing && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
  const prevVersion = typeof base.version === "number" && Number.isFinite(base.version) ? base.version : 0;
  return { ...base, ...patch, version: prevVersion + 1 };
}

async function writeMemoryAudit(db: Database, input: { userId: string; action: string; resourceId?: string | null; decision?: "allow" | "deny"; reason?: string | null; metadata?: Record<string, unknown> }) {
  try {
    await db.insert(auditLog).values({
      id: uid("aud"), userId: input.userId, ts: new Date(), actorType: "user", actorId: input.userId,
      action: input.action, resourceType: "memory_note", resourceId: input.resourceId ?? null,
      decision: input.decision ?? "allow", reason: input.reason ?? null, metadata: input.metadata ?? {},
    });
  } catch {
    // Audit must not change memory behavior.
  }
}

export function memoryRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const enabled = () => process.env.HELM_MEMORY_ENABLED === "1";

  app.get("/status", async (c) => {
    const userId = c.get("userId");
    const count = enabled() ? (await db.select({ id: memoryNotes.id }).from(memoryNotes).where(eq(memoryNotes.userId, userId)).limit(100)).length : 0;
    return c.json({
      ok: true, enabled: enabled(), mode: enabled() ? "db-notes" : "disabled", notesVisible: count,
      inferredAllowed: process.env.HELM_MEMORY_ALLOW_INFERRED === "1",
      retrievalEnabled: process.env.HELM_MEMORY_RETRIEVAL_ENABLED === "1",
      semanticRetrievalEnabled: process.env.HELM_MEMORY_SEMANTIC_RETRIEVAL === "1",
      embeddingProviderSelection: (process.env.HELM_MEMORY_EMBEDDING_PROVIDER ?? "disabled").trim().toLowerCase() || "disabled",
      embeddingProviderInjected: false,
      consolidationDryRunEnabled: process.env.HELM_MEMORY_CONSOLIDATION_DRY_RUN === "1",
      retentionDryRunEnabled: process.env.HELM_MEMORY_RETENTION_DRY_RUN === "1",
    });
  });

  app.get("/notes", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const provenanceFilter = c.req.query("provenance");
    const q = (c.req.query("q") ?? "").trim().toLowerCase().slice(0, 120);
    const rows = await db.select().from(memoryNotes).where(eq(memoryNotes.userId, userId)).orderBy(desc(memoryNotes.createdAt)).limit(200);
    const filtered = rows.filter((r) => {
      if (provenanceFilter && ((r.metadata as any)?.provenance?.kind ?? "user_confirmed") !== provenanceFilter) return false;
      if (q && !String(r.content ?? "").toLowerCase().includes(q) && !String(r.kind ?? "").toLowerCase().includes(q)) return false;
      return true;
    }).slice(0, 100);
    return c.json({ ok: true, notes: redactExportValue(filtered) });
  });

  app.get("/export", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(memoryNotes).where(eq(memoryNotes.userId, userId)).orderBy(desc(memoryNotes.createdAt)).limit(500);
    await writeMemoryAudit(db, { userId, action: "memory.export", metadata: { count: rows.length } });
    return c.json({ ok: true, exportedAt: new Date().toISOString(), count: rows.length, notes: redactExportValue(rows) });
  });

  app.post("/notes", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const raw = typeof body?.content === "string" ? body.content.trim() : "";
    if (!raw) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "content required"), 400);
    const provenanceKind = (["user_confirmed", "observed", "inferred"] as const).includes(body?.provenance) ? body.provenance as Provenance : "user_confirmed";
    if (provenanceKind === "inferred" && body?.confirmed !== true && process.env.HELM_MEMORY_ALLOW_INFERRED !== "1") {
      return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Inferred memory requires HELM_MEMORY_ALLOW_INFERRED=1 or confirmed=true"), 403);
    }
    const r = redactSensitive(raw.slice(0, 4000));
    const now = new Date();
    const confidence = clampConfidence(body?.confidence, provenanceKind);
    const retention = normalizeRetention({ retentionPolicy: body?.retentionPolicy, expiresAt: body?.expiresAt, pii: r.redacted ? "redacted" : body?.pii });
    const [row] = await db.insert(memoryNotes).values({
      id: uid("mem"), userId, identityId: typeof body?.identityId === "string" ? body.identityId : null,
      kind: typeof body?.kind === "string" ? body.kind.slice(0, 50) : "note", content: r.content,
      metadata: noteMeta({}, {
        source: "api",
        redactedSensitive: r.redacted,
        sensitivity: r.sensitivity,
        confidence,
        confirmed: body?.confirmed === true || provenanceKind === "user_confirmed",
        retentionPolicy: retention.retentionPolicy,
        expiresAt: retention.expiresAt,
        pii: retention.pii,
        provenance: { kind: provenanceKind, actor: "user", actorId: userId, ts: now.toISOString(), action: "create", source: "api" },
      }),
      createdAt: now, updatedAt: now,
    }).returning();
    await writeMemoryAudit(db, { userId, action: "memory.create", resourceId: row?.id, metadata: { kind: row?.kind, provenance: provenanceKind, sensitivity: r.sensitivity, confidence, redacted: r.redacted, version: (row?.metadata as any)?.version ?? 1, retentionPolicy: retention.retentionPolicy, pii: retention.pii } });
    return c.json({ ok: true, note: redactExportValue(row) }, 201);
  });

  app.patch("/notes/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({} as any));
    const [existing] = await db.select().from(memoryNotes).where(and(eq(memoryNotes.id, id), eq(memoryNotes.userId, userId))).limit(1);
    if (!existing) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Memory note not found"), 404);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const existingMeta = (existing.metadata as Record<string, unknown> ?? {});
    const provKind = (["user_confirmed", "observed", "inferred"] as const).includes(body?.provenance) ? body.provenance as Provenance : ((existingMeta.provenance as any)?.kind ?? "user_confirmed");
    if (provKind === "inferred" && body?.confirmed !== true && existingMeta.confirmed !== true && process.env.HELM_MEMORY_ALLOW_INFERRED !== "1") {
      return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Inferred memory requires HELM_MEMORY_ALLOW_INFERRED=1 or confirmed=true"), 403);
    }
    if (typeof body?.content === "string" && body.content.trim()) {
      const r = redactSensitive(body.content.trim().slice(0, 4000));
      patch.content = r.content;
      const retention = normalizeRetention({ retentionPolicy: body?.retentionPolicy ?? existingMeta.retentionPolicy, expiresAt: body?.expiresAt ?? existingMeta.expiresAt, pii: r.redacted ? "redacted" : body?.pii ?? existingMeta.pii });
      patch.metadata = noteMeta(existingMeta, {
        source: "api", redactedSensitive: r.redacted, sensitivity: r.sensitivity,
        confidence: clampConfidence(body?.confidence ?? existingMeta.confidence, provKind),
        confirmed: body?.confirmed === true || existingMeta.confirmed === true || provKind === "user_confirmed",
        retentionPolicy: retention.retentionPolicy, expiresAt: retention.expiresAt, pii: retention.pii,
        provenance: { kind: provKind, actor: "user", actorId: userId, ts: new Date().toISOString(), action: "update", source: "api" },
      });
    }
    if (typeof body?.kind === "string" && body.kind.trim()) patch.kind = body.kind.trim().slice(0, 50);
    if (typeof body?.identityId === "string" || body?.identityId === null) patch.identityId = body.identityId;
    if (!("metadata" in patch)) {
      const retention = normalizeRetention({ retentionPolicy: body?.retentionPolicy ?? existingMeta.retentionPolicy, expiresAt: body?.expiresAt ?? existingMeta.expiresAt, pii: body?.pii ?? existingMeta.pii });
      patch.metadata = noteMeta(existingMeta, {
        confidence: clampConfidence(body?.confidence ?? existingMeta.confidence, provKind),
        confirmed: body?.confirmed === true || existingMeta.confirmed === true || provKind === "user_confirmed",
        retentionPolicy: retention.retentionPolicy, expiresAt: retention.expiresAt, pii: retention.pii,
        provenance: { kind: provKind, actor: "user", actorId: userId, ts: new Date().toISOString(), action: "update", source: "api" },
      });
    }
    const [row] = await db.update(memoryNotes).set(patch).where(and(eq(memoryNotes.id, id), eq(memoryNotes.userId, userId))).returning();
    await writeMemoryAudit(db, { userId, action: "memory.update", resourceId: row?.id ?? id, metadata: { kind: row?.kind, provenance: provKind, version: (row?.metadata as any)?.version ?? null, redacted: (row?.metadata as any)?.redactedSensitive ?? null } });
    return c.json({ ok: true, note: redactExportValue(row) });
  });

  app.get("/notes/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(memoryNotes).where(and(eq(memoryNotes.id, id), eq(memoryNotes.userId, userId))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Memory note not found"), 404);
    return c.json({ ok: true, note: redactExportValue(row) });
  });

  app.delete("/notes/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.delete(memoryNotes).where(and(eq(memoryNotes.id, id), eq(memoryNotes.userId, userId))).returning({ id: memoryNotes.id });
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Memory note not found"), 404);
    await writeMemoryAudit(db, { userId, action: "memory.delete", resourceId: row.id, metadata: { deleted: true } });
    return c.json({ ok: true, deletedId: row.id });
  });

  app.get("/retention/dry-run", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    if (process.env.HELM_MEMORY_RETENTION_DRY_RUN !== "1") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory retention dry-run disabled (HELM_MEMORY_RETENTION_DRY_RUN!=1)"), 403);
    const userId = c.get("userId");
    const now = Date.now();
    const rows = await db.select().from(memoryNotes).where(eq(memoryNotes.userId, userId)).orderBy(desc(memoryNotes.createdAt)).limit(500);
    const candidates = rows.filter((r) => {
      const meta = (r.metadata as Record<string, unknown> ?? {});
      const policy = typeof meta.retentionPolicy === "string" ? meta.retentionPolicy : "user_controlled";
      const expiresAt = typeof meta.expiresAt === "string" ? Date.parse(meta.expiresAt) : NaN;
      return policy !== "user_controlled" && Number.isFinite(expiresAt) && expiresAt <= now;
    }).map((r) => {
      const meta = (r.metadata as Record<string, unknown> ?? {});
      return { id: r.id, kind: r.kind, retentionPolicy: meta.retentionPolicy ?? "user_controlled", expiresAt: meta.expiresAt ?? null, pii: meta.pii ?? "none", version: meta.version ?? null };
    });
    await writeMemoryAudit(db, { userId, action: "memory.retention.dry_run", metadata: { scanned: rows.length, candidates: candidates.length, deleted: 0, dryRun: true } });
    return c.json({ ok: true, dryRun: true, deleted: 0, scanned: rows.length, candidates, note: "No memory rows were deleted. This is a dry-run report only." });
  });


  app.get("/retrieval", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    if (process.env.HELM_MEMORY_RETRIEVAL_ENABLED !== "1") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory retrieval disabled (HELM_MEMORY_RETRIEVAL_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const q = (c.req.query("q") ?? "").trim().slice(0, 200);
    if (!q) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "q required"), 400);
    const limit = Math.max(1, Math.min(20, Number(c.req.query("limit") ?? 5) || 5));
    const rows = await db.select().from(memoryNotes).where(eq(memoryNotes.userId, userId)).orderBy(desc(memoryNotes.createdAt)).limit(200);
    const provider = createMemoryRetrievalProvider({
      env: process.env,
      // No default embedding provider wiring: external/local model providers must be explicitly injected by trusted code.
      embeddingProvider: null,
    });
    const ranked = await provider.query({
      query: q,
      limit,
      documents: rows.map((r) => ({ id: r.id, kind: String(r.kind ?? "note"), content: String(r.content ?? ""), createdAt: r.createdAt, metadata: (r.metadata as Record<string, unknown> ?? {}) })),
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const matches = ranked.map((m) => {
      const note = byId.get(m.id);
      if (!note) return null;
      return { note, score: m.score, matchedTokens: m.matchedTokens, provenance: m.provenance, confidence: m.confidence, mode: m.mode };
    }).filter(Boolean);
    await writeMemoryAudit(db, { userId, action: "memory.retrieval.query", metadata: { qLength: q.length, scanned: rows.length, matches: matches.length, limit, mode: provider.mode } });
    return c.json({ ok: true, query: q, scanned: rows.length, mode: provider.mode, matches, note: "Bounded retrieval only; semantic mode is deterministic local hash fallback when enabled. No auto-delete, no autonomous behavior change." });
  });

  app.get("/consolidation/dry-run", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    if (process.env.HELM_MEMORY_CONSOLIDATION_DRY_RUN !== "1") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory consolidation dry-run disabled (HELM_MEMORY_CONSOLIDATION_DRY_RUN!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(memoryNotes).where(eq(memoryNotes.userId, userId)).orderBy(desc(memoryNotes.createdAt)).limit(200);
    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const key = `${String(r.kind ?? "note").toLowerCase()}::${String(r.content ?? "").trim().toLowerCase()}`;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    const candidates = Array.from(groups.entries()).filter(([, arr]) => arr.length > 1).slice(0, 50).map(([key, arr]) => {
      const canonical = arr[0];
      const canonicalMeta = (canonical?.metadata as Record<string, unknown> ?? {});
      const duplicateIds = arr.slice(1).map((r) => r.id);
      return {
        key: key.slice(0, 180),
        count: arr.length,
        keepId: canonical?.id,
        duplicateIds,
        reason: "exact_content_kind_match",
        suggestedCanonical: {
          id: canonical?.id,
          kind: canonical?.kind ?? "note",
          contentPreview: String(canonical?.content ?? "").slice(0, 160),
          provenance: String((canonicalMeta.provenance as any)?.kind ?? "user_confirmed"),
          confidence: typeof canonicalMeta.confidence === "number" ? canonicalMeta.confidence : null,
        },
        mergePreview: {
          canonicalId: canonical?.id,
          duplicateIds,
          wouldMergeCount: duplicateIds.length,
          strategy: "exact_dedupe_keep_newest",
          applied: false,
        },
        proposalOnly: true,
        recommendedAction: "review_only_no_auto_merge",
      };
    });
    await writeMemoryAudit(db, { userId, action: "memory.consolidation.dry_run", metadata: { scanned: rows.length, candidates: candidates.length, deleted: 0, modified: 0, dryRun: true } });
    return c.json({ ok: true, dryRun: true, scanned: rows.length, deleted: 0, modified: 0, candidates, note: "No memory rows were deleted or modified. Consolidation dry-run report only; candidates are proposal-only merge previews." });
  });

  app.get("/audit/recent", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(auditLog).where(and(eq(auditLog.userId, userId), eq(auditLog.resourceType, "memory_note"))).orderBy(desc(auditLog.ts)).limit(50);
    return c.json({ ok: true, events: rows.map((r) => ({ id: r.id, ts: r.ts, action: r.action, resourceId: r.resourceId, decision: r.decision, reason: r.reason, metadata: redactExportValue(r.metadata ?? {}) })) });
  });
  return app;
}




