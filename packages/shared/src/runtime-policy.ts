import { z } from "zod";

export const RuntimeModelSensitivity = z.enum(["normal", "sensitive"]);
export type RuntimeModelSensitivity = z.infer<typeof RuntimeModelSensitivity>;

export const RuntimeModelRoute = z.enum(["local-default", "override", "fallback-no-model"]);
export type RuntimeModelRoute = z.infer<typeof RuntimeModelRoute>;

export const RuntimeModelPolicyInput = z.object({
  requestedModel: z.string().min(1).optional(),
  requestedProvider: z.string().min(1).optional(),
  requestedBaseUrl: z.string().url().optional(),
  sensitivity: RuntimeModelSensitivity.default("normal"),
  taskKind: z.string().default("assistant"),
  toolCallingRequired: z.boolean().default(false),
  prompt: z.string().optional(),
  sensitivitySource: z.enum(["explicit", "heuristic", "default"]).optional(),
});
export type RuntimeModelPolicyInput = z.infer<typeof RuntimeModelPolicyInput>;

export const RuntimeModelPolicyDecision = z.object({
  route: RuntimeModelRoute,
  selectedModel: z.string().nullable(),
  selectedProvider: z.string().nullable(),
  selectedBaseUrl: z.string().nullable(),
  toolCapable: z.boolean(),
  allowlisted: z.boolean(),
  sensitivity: RuntimeModelSensitivity,
  sensitivitySource: z.enum(["explicit", "heuristic", "default"]),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
  egressAllowed: z.boolean(),
  egressPolicy: z.enum(["allow", "deny-nonlocal-sensitive"]),
});
export type RuntimeModelPolicyDecision = z.infer<typeof RuntimeModelPolicyDecision>;

export const DEFAULT_TOOL_CAPABLE_ALLOWLIST = ["llama3.2:latest", "llama3.2:3b", "qwen2.5:latest", "qwen2.5:3b"] as const;

export function normalizeAllowlist(raw: string | undefined | null): string[] {
  const base = (raw ?? DEFAULT_TOOL_CAPABLE_ALLOWLIST.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set(base)];
}

export function isLocalProvider(provider: string | null | undefined, baseUrl: string | null | undefined): boolean {
  const p = (provider ?? "").toLowerCase();
  const b = (baseUrl ?? "").toLowerCase();
  return p === "ollama" || b.includes("11434") || b.includes("localhost") || b.includes("127.0.0.1");
}

const SENSITIVE_PROMPT_RE = /\b(password|passcode|otp|one[- ]time|2fa|mfa|ssn|social security|credit card|card number|cvv|bank account|routing number|api key|secret key|private key|seed phrase|recovery phrase|bearer token|access token)\b/i;

export function inferRuntimeSensitivity(input: { sensitivity?: RuntimeModelSensitivity; prompt?: string; context?: Record<string, unknown> | null }): { sensitivity: RuntimeModelSensitivity; source: "explicit" | "heuristic" | "default" } {
  if (input.sensitivity === "sensitive") return { sensitivity: "sensitive", source: "explicit" };
  const ctx = input.context ?? {};
  if (ctx.sensitive === true || ctx.containsSensitiveData === true || ctx.pii === true) return { sensitivity: "sensitive", source: "explicit" };
  const text = String(input.prompt ?? "").slice(0, 2000);
  if (text && SENSITIVE_PROMPT_RE.test(text)) return { sensitivity: "sensitive", source: "heuristic" };
  return { sensitivity: input.sensitivity ?? "normal", source: input.sensitivity ? "explicit" : "default" };
}

export function decideRuntimeModelPolicy(
  input: RuntimeModelPolicyInput,
  env: { defaultModel?: string | null; defaultProvider?: string | null; defaultBaseUrl?: string | null; allowlist?: string[]; enforceSensitiveEgress?: boolean },
): RuntimeModelPolicyDecision {
  const allowlist = (env.allowlist ?? [...DEFAULT_TOOL_CAPABLE_ALLOWLIST]).map((s) => s.toLowerCase());
  const inferred = inferRuntimeSensitivity({ sensitivity: input.sensitivity, prompt: input.prompt });
  const sensitivity = inferred.sensitivity;
  const sensitivitySource = input.sensitivitySource ?? inferred.source;
  const selectedModel = input.requestedModel ?? env.defaultModel ?? null;
  const selectedProvider = input.requestedProvider ?? env.defaultProvider ?? (isLocalProvider(null, input.requestedBaseUrl ?? env.defaultBaseUrl ?? null) ? "ollama" : "openai-compatible");
  const selectedBaseUrl = input.requestedBaseUrl ?? env.defaultBaseUrl ?? null;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!selectedModel || !selectedBaseUrl) {
    return {
      route: "fallback-no-model",
      selectedModel,
      selectedProvider,
      selectedBaseUrl,
      toolCapable: false,
      allowlisted: false,
      sensitivity,
      sensitivitySource,
      reasons: ["No model/baseUrl configured; runtime will use deterministic fallback"],
      warnings: [],
      egressAllowed: true,
      egressPolicy: "allow",
    };
  }

  const route: RuntimeModelRoute = input.requestedModel ? "override" : "local-default";
  reasons.push(input.requestedModel ? "Using explicit model override" : "Using configured default model");
  const local = isLocalProvider(selectedProvider, selectedBaseUrl);
  if (local) reasons.push("Local/provider-local endpoint selected");
  else reasons.push("Non-local provider endpoint selected");
  if (sensitivitySource === "heuristic") reasons.push("Sensitivity inferred from prompt/context heuristic");

  const sensitiveNonLocal = sensitivity === "sensitive" && !local;
  const denySensitiveEgress = sensitiveNonLocal && env.enforceSensitiveEgress === true;
  if (sensitiveNonLocal) {
    warnings.push(denySensitiveEgress
      ? "Sensitive task cannot use non-local provider while sensitive egress enforcement is enabled"
      : "Sensitive task routed to non-local provider; confirm policy allows external model egress");
  }
  if (input.taskKind === "browser" && !input.toolCallingRequired) {
    reasons.push("Browser task may require tool-capable model when tool calling is enabled");
  }

  const allowlisted = allowlist.includes(selectedModel.toLowerCase());
  const toolCapable = selectedProvider !== "ollama" ? true : allowlisted;
  if (selectedProvider === "ollama" && !allowlisted) {
    warnings.push(`Ollama model '${selectedModel}' not in tool-capable allowlist`);
  }
  if (input.toolCallingRequired && !toolCapable) {
    warnings.push("Tool calling required but selected model is not tool-capable allowlisted");
  }

  return {
    route,
    selectedModel,
    selectedProvider,
    selectedBaseUrl,
    toolCapable,
    allowlisted,
    sensitivity,
    sensitivitySource,
    reasons,
    warnings,
    egressAllowed: !denySensitiveEgress,
    egressPolicy: denySensitiveEgress ? "deny-nonlocal-sensitive" : "allow",
  };
}
