import { Hono } from "hono";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";

const err = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });

export function memoryRoutes() {
  const app = new Hono<AppEnv>();
  const enabled = process.env.HELM_MEMORY_ENABLED === "1";
  app.get("/status", (c) => c.json({ ok: true, enabled, mode: "design-only", message: enabled ? "Memory flag enabled but no DB-backed memory implementation yet." : "Memory disabled by default." }));
  app.post("/notes", (c) => {
    if (!enabled) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Memory is disabled (HELM_MEMORY_ENABLED!=1)"), 403);
    return c.json(err(HELM_ERROR_CODES.NOT_IMPLEMENTED ?? "NOT_IMPLEMENTED", "Memory write path not implemented; design-only slice." , false), 501);
  });
  return app;
}
