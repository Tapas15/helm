import type { MiddlewareHandler } from "hono";
import { and, eq, gt, isNull } from "drizzle-orm";
import { sessions, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import { createHash } from "node:crypto";
import type { AppEnv } from "../types.js";

const DEV_USER_ID = "usr_local_dev";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function authMiddleware(db: Database): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requireAuth = process.env.HELM_REQUIRE_AUTH === "1";
    const allowDev = process.env.HELM_ALLOW_DEV_AUTH !== "0";
    const authHeader = c.req.header("authorization")?.trim();
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) {
        const tokenHash = hashToken(token);
        const now = new Date();
        const [row] = await db.select({ id: sessions.id, userId: sessions.userId }).from(sessions)
          .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now))).limit(1);
        if (row) {
          await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
          c.set("userId", row.userId);
          c.set("sessionId", row.id);
          c.set("authMethod", "session_token");
          c.set("logger", c.get("logger").child({ userId: row.userId, sessionId: row.id, authMethod: "session_token" }));
          await next();
          return;
        }
        return c.json({ error: { code: HELM_ERROR_CODES.UNAUTHORIZED, message: "Invalid or expired session token", retryable: false } }, 401);
      }
    }

    const header = c.req.header("x-user-id")?.trim();
    const userId = header || (!requireAuth && allowDev ? DEV_USER_ID : "");
    if (!userId) return c.json({ error: { code: HELM_ERROR_CODES.UNAUTHORIZED, message: "Authentication required", retryable: false } }, 401);
    c.set("userId", userId);
    c.set("authMethod", "dev_header");
    c.set("logger", c.get("logger").child({ userId, authMethod: "dev_header" }));
    await next();
  };
}
