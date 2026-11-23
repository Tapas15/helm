import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { memoryNotes, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

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
  app.post("/notes", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "content required"), 400);
    const now = new Date();
    const [row] = await db.insert(memoryNotes).values({ id: uid("mem"), userId, identityId: typeof body?.identityId === "string" ? body.identityId : null, kind: typeof body?.kind === "string" ? body.kind.slice(0, 50) : "note", content: content.slice(0, 4000), metadata: { source: "api" }, createdAt: now, updatedAt: now }).returning();
    return c.json({ ok: true, note: row }, 201);
  });
  return app;
}
