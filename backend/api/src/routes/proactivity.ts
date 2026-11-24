import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { proactivityRules, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });

export function proactivityRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const enabled = () => process.env.HELM_PROACTIVITY_ENABLED === "1";
  app.get("/status", (c) => c.json({ ok: true, enabled: enabled(), execution: "disabled-by-default", note: "Rules can be stored when enabled; autonomous execution requires explicit activation design." }));
  app.get("/rules", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proactivity disabled (HELM_PROACTIVITY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const rows = await db.select().from(proactivityRules).where(eq(proactivityRules.userId, userId)).orderBy(desc(proactivityRules.updatedAt)).limit(100);
    return c.json({ ok: true, rules: rows });
  });
  app.post("/rules", async (c) => {
    if (!enabled()) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Proactivity disabled (HELM_PROACTIVITY_ENABLED!=1)"), 403);
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "name required"), 400);
    const now = new Date();
    const [row] = await db.insert(proactivityRules).values({ id: uid("prv"), userId, name, enabled: body?.enabled === true, triggerKind: typeof body?.triggerKind === "string" ? body.triggerKind.slice(0, 50) : "cron", triggerConfig: typeof body?.triggerConfig === "object" && body.triggerConfig ? body.triggerConfig : {}, actionKind: typeof body?.actionKind === "string" ? body.actionKind.slice(0, 50) : "draft", actionConfig: typeof body?.actionConfig === "object" && body.actionConfig ? body.actionConfig : {}, requireApproval: body?.requireApproval !== false, createdAt: now, updatedAt: now }).returning();
    return c.json({ ok: true, rule: row }, 201);
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
    if (typeof body?.actionKind === "string") patch.actionKind = body.actionKind.slice(0, 50);
    if (typeof body?.actionConfig === "object" && body.actionConfig) patch.actionConfig = body.actionConfig;
    if (typeof body?.requireApproval === "boolean") patch.requireApproval = body.requireApproval;
    const [row] = await db.update(proactivityRules).set(patch).where(and(eq(proactivityRules.id, id), eq(proactivityRules.userId, userId))).returning();
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Rule not found"), 404);
    return c.json({ ok: true, rule: row });
  });
  return app;
}
