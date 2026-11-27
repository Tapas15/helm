import { describe, expect, it } from "vitest";
import { buildSystemPrompt, evaluateToolPolicy, hasApprovalForAction, isHighRiskPrompt, isToolCapableModel, normalizeBrowserToolArgs, redactModelError, resolveModel, RUNTIME_TOOL_REGISTRY, shouldExposeBrowserTools } from "./runtime.js";

const baseInput = { taskId: "t1", runId: "r1", userId: "u1", kind: "assistant" as const, prompt: "hello", context: {}, trace: { taskId: "t1", runId: "r1", userId: "u1" }, thread: [] };

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
  it("system prompt includes resume checkpoint summary", () => {
    const p = buildSystemPrompt({ ...baseInput, context: { activeBrowserSessionId: "s1", runtimeResumePlan: { version: 1, lastSafeBoundary: "runtime.tool.completed", completedToolRefs: [{ name: "browser_snapshot", eventSeq: 1 }], completedActionHashes: ["ah1"] } } });
    expect(p).toContain("Resume checkpoint");
    expect(p).toContain("boundary=runtime.tool.completed");
    expect(p).toContain("browser_snapshot");
    expect(p).toContain("ah1");
    expect(p).toContain("Do not repeat completed side-effect actions");
  });
  it("normalizes missing browser sessionId from active context", () => {
    expect(normalizeBrowserToolArgs({ url: "https://example.com" }, "s1")).toEqual({ ok: true, args: { url: "https://example.com", sessionId: "s1" } });
    expect(normalizeBrowserToolArgs({ sessionId: "undefined" }, "")).toMatchObject({ ok: false });
  });
  it("exposes tool registry and high-risk prompt classifier", () => {
    expect(RUNTIME_TOOL_REGISTRY.map(t => t.name)).toEqual(["browser_navigate","browser_snapshot","browser_click"]);
    expect(RUNTIME_TOOL_REGISTRY.find(t => t.name === "browser_click")?.requiresApproval).toBe(true);
    expect(isHighRiskPrompt("please buy this")).toBe(true);
    expect(isHighRiskPrompt("wire funds")).toBe(true);
    expect(isHighRiskPrompt("summarize this page")).toBe(false);
    expect(hasApprovalForAction({ approvalGranted: true })).toBe(true);
    expect(hasApprovalForAction({ approvedActionKinds: ["external.high_risk"] })).toBe(true);
    expect(hasApprovalForAction({ approvedActionKinds: ["other"] })).toBe(false);
  });
  it("resolveModel includes routing policy decision", () => {
    const cfg = resolveModel({ OLLAMA_BASE_URL: "http://127.0.0.1:11434" } as any, { model: "qwen2.5:latest", provider: "ollama" }, { toolCallingRequired: true, taskKind: "assistant", sensitivity: "normal" });
    expect(cfg?.policy.route).toBe("override");
    expect(cfg?.policy.toolCapable).toBe(true);
  });
  it("resolveModel blocks sensitive non-local egress when enforcement enabled", () => {
    const prev = process.env.HELM_ENFORCE_SENSITIVE_EGRESS;
    process.env.HELM_ENFORCE_SENSITIVE_EGRESS = "1";
    try {
      const cfg = resolveModel({ ...process.env, HELM_MODEL_TOOL_CAPABLE_ALLOWLIST: "llama3.2:latest" }, { model: "gpt-4.1-mini", provider: "openai-compatible", baseUrl: "https://api.openai.com/v1" }, { sensitivity: "sensitive", toolCallingRequired: true, taskKind: "assistant" });
      expect(cfg?.policy.egressAllowed).toBe(false);
      expect(cfg?.policy.egressPolicy).toBe("deny-nonlocal-sensitive");
    } finally {
      if (prev === undefined) delete process.env.HELM_ENFORCE_SENSITIVE_EGRESS; else process.env.HELM_ENFORCE_SENSITIVE_EGRESS = prev;
    }
  });

  it("enforces tool policy for unknown/high-risk browser tools", () => {
    expect(evaluateToolPolicy("unknown", {}, {})).toMatchObject({ ok: false });
    expect(evaluateToolPolicy("browser_click", { sessionId: "s1", selector: "#a" }, {})).toMatchObject({ ok: false });
    expect(evaluateToolPolicy("browser_click", { sessionId: "s1", selector: "#a", approvalId: "apr", actionHash: "ah", idempotencyKey: "ik" }, { approvedActionKinds: ["external.high_risk"], approvedActionHashes: ["ah"] })).toMatchObject({ ok: true });
  });
  it("blocks duplicate read-only tool call from resumePlan by argsKey", () => {
    const result = evaluateToolPolicy("browser_snapshot", { sessionId: "s1" }, { runtimeResumePlan: { version: 1, lastSafeBoundary: "runtime.tool.completed", completedToolRefs: [{ name: "browser_snapshot", eventSeq: 1, argsKey: JSON.stringify({ sessionId: "s1" }) }], completedActionHashes: [] } });
    expect(result).toMatchObject({ ok: false, deduped: true });
    expect(String((result as any).error)).toContain("already completed for same args");
  });
  it("denies duplicate side-effect when executedActionHashes contains actionHash", () => {
    const ctx = { executedActionHashes: ["ah_done"] };
    const r = evaluateToolPolicy("browser_click", { sessionId: "bs_1", selector: "#buy", approvalId: "apr_1", actionHash: "ah_done", idempotencyKey: "ik1" }, ctx);
    expect(r.ok).toBe(false);
    expect((r as any).deduped).toBe(true);
    expect((r as any).dedupeReason).toBe("executed_action_hash");
  });

  it("resolveModel infers sensitive prompt and can deny non-local egress", () => {
    const cfg = resolveModel({
      HELM_MODEL: "gpt-4.1-mini",
      HELM_MODEL_PROVIDER: "openai-compatible",
      HELM_MODEL_BASE_URL: "https://api.openai.com/v1",
      HELM_ENFORCE_SENSITIVE_EGRESS: "1",
    } as any, undefined, { taskKind: "assistant", toolCallingRequired: true, prompt: "my credit card number is 4111..." });
    expect(cfg?.policy.sensitivity).toBe("sensitive");
    expect(cfg?.policy.sensitivitySource).toBe("heuristic");
    expect(cfg?.policy.egressAllowed).toBe(false);
  });
});

