import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@helm/db";
import { HELM_ERROR_CODES, decideRuntimeModelPolicy, normalizeAllowlist } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { redactSensitive } from "../lib/redaction.js";

const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
const redactValue = (value: unknown) => redactSensitive(value);
const ModelOverrideInput = z.object({
  model: z.string().min(1).max(200).optional(),
  provider: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().int().min(5000).max(300000).optional(),
  maxTokens: z.number().int().min(128).max(8192).optional(),
  sensitivity: z.enum(["normal", "sensitive"]).optional(),
  taskKind: z.string().min(1).max(50).optional(),
  toolCallingRequired: z.boolean().optional(),
  prompt: z.string().max(2000).optional(),
}).strict();

export function runtimeRoutes(_db: Database) {
  const app = new Hono<AppEnv>();

  app.get("/config", (c) => {
    const allowlist = normalizeAllowlist(process.env.HELM_MODEL_TOOL_CAPABLE_ALLOWLIST);
    const defaultBaseUrl = process.env.HELM_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL ?? (process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL}/v1` : null);
    const provider = process.env.HELM_MODEL_PROVIDER ?? (process.env.OLLAMA_BASE_URL || defaultBaseUrl?.includes("11434") ? "ollama" : "openai-compatible");
    const model = process.env.HELM_MODEL ?? process.env.OPENAI_MODEL ?? (process.env.OLLAMA_BASE_URL ? "llama3.2:latest" : null);
    const policy = decideRuntimeModelPolicy({ sensitivity: "normal", taskKind: "assistant", toolCallingRequired: false }, { defaultModel: model, defaultProvider: provider, defaultBaseUrl, allowlist, enforceSensitiveEgress: process.env.HELM_ENFORCE_SENSITIVE_EGRESS === "1" });
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
      prompt: override.prompt,
    }, { defaultModel, defaultProvider, defaultBaseUrl, allowlist, enforceSensitiveEgress: process.env.HELM_ENFORCE_SENSITIVE_EGRESS === "1" });
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
