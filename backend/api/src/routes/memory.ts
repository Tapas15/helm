import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { memoryNotes, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

const SENSITIVE_RE = /(api[_-]?key|secret|password|token|bearer|private key|vault|sk-[a-z0-9]|ghp_[a-z0-9]|AIza[0-9A-Za-z_-])/i;
function redactSensitive(text: string): { content: string; redacted: boolean; sensitivity: "normal" | "sensitive-redacted" } {
  if (!SENSITIVE_RE.test(text)) return { content: text, redacted: false, sensitivity: "normal" };
  return { content: "[REDACTED_SENSITIVE_MEMORY]", redacted: true, sensitivity: "sensitive-redacted" };
}

function noteMeta(existing: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const base = typeof existing === "object" && existing && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
  const prevVersion = typeof base.version === "number" && Number.isFinite(base.version) ? base.version : 0;
  return { ...base, ...patch, version: prevVersion + 1 };
}

export function memoryRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const enabled = () => process.env.HELM_MEMORY_ENABLED === "1";
  app.get("/status", async (c) => {
    const userId = c.get("userId");
    const count = enabled() ? (await db.select({ id: memoryNotes.id }).from(memoryNotes).where(eq(memoryNotes.userId, userId)).limit(100)).length : 0;
    return c.json({ ok: true, enabled: enabled(), mode: enabled() ? "db-notes" : "disabled", notesVisible: count });
  });
  app.get("/notes", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(memoryNotes).where(eq(memoryNotes.userId, userId)).orderBy(desc(memoryNotes.createdAt)).limit(50);
    return c.json({ ok: true, notes: rows });
  });
  app.get("/export", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(memoryNotes).where(eq(memoryNotes.userId, userId)).orderBy(desc(memoryNotes.createdAt)).limit(500);
    return c.json({ ok: true, exportedAt: new Date().toISOString(), count: rows.length, notes: rows });
  });
  app.post("/notes", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const raw = typeof body?.content === "string" ? body.content.trim() : "";
    if (!raw) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "content required"), 400);
    const r = redactSensitive(raw.slice(0, 4000));
    const now = new Date();
    const [row] = await db.insert(memoryNotes).values({
      id: uid("mem"), userId, identityId: typeof body?.identityId === "string" ? body.identityId : null,
      kind: typeof body?.kind === "string" ? body.kind.slice(0, 50) : "note", content: r.content,
      metadata: noteMeta({}, {
        source: "api",
        redactedSensitive: r.redacted,
        sensitivity: r.sensitivity,
        provenance: { actor: "user", actorId: userId, ts: now.toISOString(), action: "create", source: "api" },
      }),
      createdAt: now, updatedAt: now,
    }).returning();
    return c.json({ ok: true, note: row }, 201);
  });
  app.patch("/notes/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({} as any));
    const [existing] = await db.select().from(memoryNotes).where(and(eq(memoryNotes.id, id), eq(memoryNotes.userId, userId))).limit(1);
    if (!existing) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Memory note not found"), 404);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body?.content === "string" && body.content.trim()) {
      const r = redactSensitive(body.content.trim().slice(0, 4000));
      patch.content = r.content;
      patch.metadata = noteMeta(existing.metadata, {
        source: "api",
        redactedSensitive: r.redacted,
        sensitivity: r.sensitivity,
        provenance: { actor: "user", actorId: userId, ts: new Date().toISOString(), action: "update", source: "api" },
      });
    }
    if (typeof body?.kind === "string" && body.kind.trim()) patch.kind = body.kind.trim().slice(0, 50);
    if (typeof body?.identityId === "string" || body?.identityId === null) patch.identityId = body.identityId;
    if (!("metadata" in patch) && Object.keys(patch).length > 1) {
      patch.metadata = noteMeta(existing.metadata, { provenance: { actor: "user", actorId: userId, ts: new Date().toISOString(), action: "update", source: "api" } });
    }
    const [row] = await db.update(memoryNotes).set(patch).where(and(eq(memoryNotes.id, id), eq(memoryNotes.userId, userId))).returning();
    return c.json({ ok: true, note: row });
  });
  app.get("/notes/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(memoryNotes).where(and(eq(memoryNotes.id, id), eq(memoryNotes.userId, userId))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Memory note not found"), 404);
    return c.json({ ok: true, note: row });
  });
  app.delete("/notes/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.delete(memoryNotes).where(and(eq(memoryNotes.id, id), eq(memoryNotes.userId, userId))).returning({ id: memoryNotes.id });
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Memory note not found"), 404);
    return c.json({ ok: true, deletedId: row.id });
  });
  return app;
}
