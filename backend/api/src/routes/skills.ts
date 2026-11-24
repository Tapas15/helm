import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { skills, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });

export function skillsRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const enabled = () => process.env.HELM_SKILLS_ENABLED === "1";
  app.get("/status", (c) => c.json({ ok: true, enabled: enabled(), selfImprovement: { allowed: false, reason: "Requires explicit user approval before implementation/activation." } }));
  app.get("/", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Skills disabled (HELM_SKILLS_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(skills).where(eq(skills.userId, userId)).orderBy(desc(skills.updatedAt)).limit(100);
    return c.json({ ok: true, skills: rows });
  });
  app.post("/", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Skills disabled (HELM_SKILLS_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "name required"), 400);
    const now = new Date();
    const [row] = await db.insert(skills).values({ id: uid("skl"), userId, name, description: typeof body?.description === "string" ? body.description.slice(0, 1000) : null, enabled: body?.enabled !== false, source: "local", config: typeof body?.config === "object" && body.config ? body.config : {}, createdAt: now, updatedAt: now }).returning();
    return c.json({ ok: true, skill: row }, 201);
  });
  app.patch("/:id", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Skills disabled (HELM_SKILLS_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({} as any));
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
    if (typeof body?.description === "string") patch.description = body.description.slice(0, 1000);
    if (typeof body?.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body?.config === "object" && body.config) patch.config = body.config;
    const [row] = await db.update(skills).set(patch).where(and(eq(skills.id, id), eq(skills.userId, userId))).returning();
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Skill not found"), 404);
    return c.json({ ok: true, skill: row });
  });
  return app;
}
