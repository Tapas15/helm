import { describe, expect, it } from "vitest";
import { buildSystemPrompt, isToolCapableModel, redactModelError, resolveModel, shouldExposeBrowserTools } from "./runtime.js";

const baseInput = { taskId: "t1", runId: "r1", userId: "u1", kind: "assistant" as const, prompt: "hello", context: {}, trace: { taskId: "t1", runId: "r1", userId: "u1" } };

describe("runtime helpers", () => {
  it("resolveModel uses ollama defaults and clamps limits", () => {
    const cfg = resolveModel({ OLLAMA_BASE_URL: "http://127.0.0.1:11434", HELM_MODEL_TIMEOUT_MS: "1", HELM_MODEL_MAX_TOKENS: "1" } as any);
    expect(cfg?.provider).toBe("ollama");
    expect(cfg?.model).toBe("llama3.2:latest");
    expect(cfg?.timeoutMs).toBe(5000);
    expect(cfg?.maxTokens).toBe(128);
  });
  it("tool capability allowlist gates ollama models", () => {
    const cfg = resolveModel({ OLLAMA_BASE_URL: "http://127.0.0.1:11434", HELM_MODEL: "custom:latest", HELM_MODEL_TOOL_CAPABLE_ALLOWLIST: "a,b" } as any)!;
    expect(isToolCapableModel(cfg)).toBe(false);
  });
  it("redacts bearer tokens", () => {
    expect(redactModelError("Authorization: Bearer abc.def-123")).toContain("[redacted]");
  });
  it("exposes browser tools only for browser intent or active session", () => {
    expect(shouldExposeBrowserTools(baseInput)).toBe(false);
    expect(shouldExposeBrowserTools({ ...baseInput, prompt: "open browser and navigate" })).toBe(true);
    expect(shouldExposeBrowserTools({ ...baseInput, context: { activeBrowserSessionId: "s1" } })).toBe(true);
  });
  it("system prompt includes guardrails and memory/session context", () => {
    const p = buildSystemPrompt({ ...baseInput, context: { activeBrowserSessionId: "s1", memoryFacts: ["likes tea"] } });
    expect(p).toContain("Active browser session: s1");
    expect(p).toContain("likes tea");
    expect(p).toContain("Do not invent tool results");
  });
});
