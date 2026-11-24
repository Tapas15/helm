import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";

const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
const ModelOverrideInput = z.object({
  model: z.string().min(1).max(200).optional(),
  provider: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().int().min(5000).max(300000).optional(),
  maxTokens: z.number().int().min(128).max(8192).optional(),
}).strict();

export function runtimeRoutes(_db: Database) {
  const app = new Hono<AppEnv>();

  app.get("/config", (c) => {
    const allowlist = (process.env.HELM_MODEL_TOOL_CAPABLE_ALLOWLIST ?? "llama3.2:latest,llama3.2:3b,qwen2.5:latest,qwen2.5:3b").split(",").map(s => s.trim()).filter(Boolean);
    return c.json({
      ok: true,
      runtime: {
        provider: process.env.HELM_MODEL_PROVIDER ?? (process.env.OLLAMA_BASE_URL ? "ollama" : "openai-compatible"),
        model: process.env.HELM_MODEL ?? process.env.OPENAI_MODEL ?? (process.env.OLLAMA_BASE_URL ? "llama3.2:latest" : null),
        baseUrl: process.env.HELM_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL ?? (process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL}/v1` : null),
        toolCapableAllowlist: allowlist,
        supportsModelOverride: true,
      },
    });
  });

  app.post("/model-validate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = ModelOverrideInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid model override", false, parsed.error.flatten()), 400);
    const override = parsed.data;
    const allowlist = (process.env.HELM_MODEL_TOOL_CAPABLE_ALLOWLIST ?? "llama3.2:latest,llama3.2:3b,qwen2.5:latest,qwen2.5:3b").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const provider = override.provider ?? process.env.HELM_MODEL_PROVIDER ?? (process.env.OLLAMA_BASE_URL ? "ollama" : "openai-compatible");
    const model = override.model ?? process.env.HELM_MODEL ?? "llama3.2:latest";
    const toolCapable = provider !== "ollama" || allowlist.includes(model.toLowerCase());
    return c.json({ ok: true, override: { ...override, provider, model }, toolCapable, allowlist });
  });

  return app;
}
