import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

const DEV_USER_ID = "usr_local_dev";

// Phase 0: single-user local session skeleton.
// Replace with real session/OIDC auth in later phases.
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = c.req.header("x-user-id")?.trim() || DEV_USER_ID;
  c.set("userId", userId);
  const base = c.get("logger");
  c.set("logger", base.child({ userId }));
  await next();
};