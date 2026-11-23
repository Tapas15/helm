import { Hono } from "hono";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";

const err = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });

export function identityRoutes() {
  const app = new Hono<AppEnv>();
  app.get("/status", (c) => c.json({
    ok: true,
    defaultIdentityClass: "helm-owned",
    personalCredentialSharing: false,
    supported: ["helm-owned"],
    delegated: { supported: false, note: "User-delegated bridge requires explicit approval and narrow scopes; not enabled by default." },
  }));
  app.post("/", (_c) => _c.json(err(HELM_ERROR_CODES.NOT_IMPLEMENTED ?? "NOT_IMPLEMENTED", "Identity provisioning not implemented yet; design/contracts only."), 501));
  return app;
}
