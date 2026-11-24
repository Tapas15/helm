import { Hono } from "hono";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { Database } from "@helm/db";
import type { AppEnv } from "../types.js";
import { reconcileUncertainReceipts } from "../lib/reconciliation.js";

const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

export function reconciliationRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const enabled = () => process.env.HELM_RECONCILIATION_ENABLED === "1";

  app.get("/status", (c) => c.json({
    ok: true,
    enabled: enabled(),
    intervalMs: Number(process.env.HELM_RECONCILIATION_INTERVAL_MS ?? 60_000),
    olderThanMs: Number(process.env.HELM_RECONCILIATION_OLDER_THAN_MS ?? 60_000),
    limit: Number(process.env.HELM_RECONCILIATION_LIMIT ?? 20),
    policy: "no-blind-retry; lookup-before-fail; uncertain receipts only",
  }));

  app.post("/run", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({} as any));
    const limit = typeof body?.limit === "number" ? body.limit : undefined;
    const olderThanMs = typeof body?.olderThanMs === "number" ? body.olderThanMs : undefined;
    const scope = body?.scope === "all" ? "all" : "user";
    // scope=all is restricted to dev/internal mode; default user-scoped.
    if (scope === "all" && process.env.HELM_ALLOW_DEV_AUTH !== "1") {
      return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "scope=all requires internal/dev mode"), 403);
    }
    const result = await reconcileUncertainReceipts(db, { limit, olderThanMs, userId: scope === "all" ? undefined : userId });
    return c.json({ ok: true, ...result });
  });

  return app;
}
