import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

const DEV_USER_ID = "usr_local_dev";

// Phase 0/1: dev auth parity. Real session/OIDC auth is a future phase.
// Set HELM_REQUIRE_AUTH=1 to require x-user-id header (no silent fallback).
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requireAuth = process.env.HELM_REQUIRE_AUTH === "1";
  const header = c.req.header("x-user-id")?.trim();
  const userId = header || (requireAuth ? "" : DEV_USER_ID);
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED", message: "x-user-id required", retryable: false } }, 401);
  c.set("userId", userId);
  const base = c.get("logger");
  c.set("logger", base.child({ userId }));
  await next();
};
