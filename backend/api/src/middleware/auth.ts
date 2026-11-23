import type { MiddlewareHandler } from "hono";
import type { Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import { resolveAuth } from "../lib/auth.js";
import type { AppEnv } from "../types.js";

export function authMiddleware(db: Database): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const url = new URL(c.req.url, "http://local");
    const resolved = await resolveAuth(db, {
      authorization: c.req.header("authorization"),
      xUserId: c.req.header("x-user-id"),
      token: url.searchParams.get("token"),
    });
    if (!resolved.ok) return c.json({ error: { code: HELM_ERROR_CODES.UNAUTHORIZED, message: resolved.message, retryable: false } }, 401);
    c.set("userId", resolved.userId);
    c.set("authMethod", resolved.method);
    if (resolved.sessionId) c.set("sessionId", resolved.sessionId);
    c.set("logger", c.get("logger").child({ userId: resolved.userId, authMethod: resolved.method, ...(resolved.sessionId ? { sessionId: resolved.sessionId } : {}) }));
    await next();
  };
}
