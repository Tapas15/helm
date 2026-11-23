import { Hono } from "hono";
import { and, eq, gt, isNull } from "drizzle-orm";
import { sessions, users, type Database } from "@helm/db";
import { CreateAuthSessionInput, HELM_ERROR_CODES } from "@helm/shared";
import { createHash, randomBytes } from "node:crypto";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

export function authRoutes(db: Database) {
  const app = new Hono<AppEnv>();

  app.post("/sessions", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = CreateAuthSessionInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid session input", false, parsed.error.flatten()), 400);
    const requireAuth = process.env.HELM_REQUIRE_AUTH === "1";
    const allowDev = process.env.HELM_ALLOW_DEV_AUTH === "1";
    const authUserId = c.get("userId");
    const authMethod = c.get("authMethod");
    const requestedUserId = parsed.data.userId;
    const canCreate = authMethod === "session_token"
      ? authUserId === requestedUserId
      : (!requireAuth && allowDev && (requestedUserId === (process.env.HELM_AUTH_DEV_USER_ID ?? "usr_local_dev") || requestedUserId === authUserId));
    if (!canCreate) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Cannot create session for requested user"), 403);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, requestedUserId)).limit(1);
    if (!user) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "User not found"), 404);
    const token = randomBytes(32).toString("base64url");
    const id = uid("sess");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + parsed.data.ttlHours * 3600_000);
    await db.insert(sessions).values({
      id,
      userId: requestedUserId,
      tokenHash: hashToken(token),
      userAgent: parsed.data.userAgent ?? c.req.header("user-agent") ?? null,
      ipHash: parsed.data.ipHash ?? null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null,
    });
    return c.json({ session: { id, userId: requestedUserId, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() }, token }, 201);
  });

  app.get("/me", async (c) => {
    const userId = c.get("userId");
    const authMethod = c.get("authMethod");
    const sessionId = c.get("sessionId");
    return c.json({ auth: { userId, method: authMethod, sessionId: sessionId ?? null } });
  });

  app.post("/sessions/:id/revoke", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Session not found"), 404);
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
    return c.json({ ok: true, sessionId: id });
  });

  return app;
}

export function hashSessionToken(token: string) {
  return hashToken(token);
}
