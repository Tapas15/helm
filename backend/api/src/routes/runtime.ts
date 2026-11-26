import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@helm/db";
import { HELM_ERROR_CODES, decideRuntimeModelPolicy, normalizeAllowlist } from "@helm/shared";
import type { AppEnv } from "../types.js";

const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
const SENSITIVE_KEYS = new Set(["authorization", "cookie", "set-cookie", "password", "passwd", "secret", "token", "accesstoken", "refreshtoken", "apikey", "credential", "credentials", "privatekey", "clientsecret", "sessiontoken", "vaultkey", "encryptedvalue", "pkceverifier", "pkceverifierencrypted"]);
const redactValue = (value: unknown, keyHint = ""): unknown => {
  const lower = keyHint.toLowerCase();
  if (SENSITIVE_KEYS.has(lower)) return "[REDACTED]";
  if (lower.includes("path") && typeof value === "string" && (/^[/\\]/.test(value) || /^[A-Za-z]:[\\/]/.test(value))) return "[REDACTED_PATH]";
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactValue(v, k)]));
  return value;
};
const ModelOverrideInput = z.object({
  model: z.string().min(1).max(200).optional(),
  provider: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().int().min(5000).max(300000).optional(),
  maxTokens: z.number().int().min(128).max(8192).optional(),
  sensitivity: z.enum(["normal", "sensitive"]).optional(),
  taskKind: z.string().min(1).max(50).optional(),
  toolCallingRequired: z.boolean().optional(),
}).strict();

export function runtimeRoutes(_db: Database) {
  const app = new Hono<AppEnv>();

  app.get("/config", (c) => {
    const allowlist = normalizeAllowlist(process.env.HELM_MODEL_TOOL_CAPABLE_ALLOWLIST);
    const defaultBaseUrl = process.env.HELM_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL ?? (process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL}/v1` : null);
    const provider = process.env.HELM_MODEL_PROVIDER ?? (process.env.OLLAMA_BASE_URL || defaultBaseUrl?.includes("11434") ? "ollama" : "openai-compatible");
    const model = process.env.HELM_MODEL ?? process.env.OPENAI_MODEL ?? (process.env.OLLAMA_BASE_URL ? "llama3.2:latest" : null);
    const policy = decideRuntimeModelPolicy({ sensitivity: "normal", taskKind: "assistant", toolCallingRequired: false }, { defaultModel: model, defaultProvider: provider, defaultBaseUrl, allowlist });
    return c.json(redactValue({
      ok: true,
      runtime: {
        provider,
        model,
        baseUrl: defaultBaseUrl,
        toolCapableAllowlist: allowlist,
        supportsModelOverride: true,
        defaultPolicy: policy,
      },
    }));
  });

  app.post("/model-validate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = ModelOverrideInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid model override", false, parsed.error.flatten()), 400);
    const override = parsed.data;
    const allowlist = normalizeAllowlist(process.env.HELM_MODEL_TOOL_CAPABLE_ALLOWLIST);
    const defaultBaseUrl = process.env.HELM_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL ?? (process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL}/v1` : null);
    const defaultProvider = process.env.HELM_MODEL_PROVIDER ?? (process.env.OLLAMA_BASE_URL || defaultBaseUrl?.includes("11434") ? "ollama" : "openai-compatible");
    const defaultModel = process.env.HELM_MODEL ?? process.env.OPENAI_MODEL ?? (process.env.OLLAMA_BASE_URL ? "llama3.2:latest" : null);
    const policy = decideRuntimeModelPolicy({
      requestedModel: override.model,
      requestedProvider: override.provider,
      requestedBaseUrl: override.baseUrl,
      sensitivity: override.sensitivity ?? "normal",
      taskKind: override.taskKind ?? "assistant",
      toolCallingRequired: override.toolCallingRequired ?? false,
    }, { defaultModel, defaultProvider, defaultBaseUrl, allowlist });
    return c.json(redactValue({
      ok: true,
      override: { ...override, provider: policy.selectedProvider ?? defaultProvider, model: policy.selectedModel ?? defaultModel },
      toolCapable: policy.toolCapable,
      allowlist,
      policy,
    }));
  });

  return app;
}
