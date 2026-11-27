import { describe, expect, it } from "vitest";
import { HelmNativeRuntime } from "./runtime.js";
import type { AgentRuntime, AgentRuntimeEvent, AgentRuntimeInput } from "@helm/shared";

const base: AgentRuntimeInput = { taskId: "t1", runId: "r1", userId: "u1", kind: "assistant", prompt: "hello", context: {}, trace: { taskId: "t1", runId: "r1", userId: "u1" }, thread: [] } as any;
async function collect(rt: AgentRuntime, input: AgentRuntimeInput) { const events: AgentRuntimeEvent[] = []; for await (const e of rt.run(input)) events.push(e); return events; }

describe("runtime deterministic eval harness", () => {
  it("approval correctness: high-risk prompt without approval waits", async () => {
    const events = await collect(new HelmNativeRuntime(), { ...base, prompt: "please buy a domain" });
    expect(events.some((e) => e.type === "runtime.tool.proposed" && (e.payload as any)?.approvalRequired === true)).toBe(true);
    expect(events.at(-1)?.type).toBe("runtime.completed");
    expect((events.at(-1)?.payload as any)?.status).toBe("waiting_approval");
  });

  it("approval correctness: approved context does not wait", async () => {
    const events = await collect(new HelmNativeRuntime(), { ...base, prompt: "please buy a domain", context: { approvalGranted: true } });
    expect(events.some((e) => e.type === "runtime.tool.proposed")).toBe(false);
    expect((events.at(-1)?.payload as any)?.status).not.toBe("waiting_approval");
  });

  it("tool policy reliability: unknown/high-risk tool calls are denied by policy evaluator", async () => {
    const { evaluateToolPolicy } = await import("./runtime.js");
    expect(evaluateToolPolicy("unknown_tool", {}, {})).toMatchObject({ ok: false });
    expect(evaluateToolPolicy("browser_click", { sessionId: "s1", selector: "#buy" }, {})).toMatchObject({ ok: false });
  });

  it("recovery semantics: interrupted events map to cancelled result", async () => {
    const events: AgentRuntimeEvent[] = [
      { type: "runtime.started", ts: new Date().toISOString(), trace: {}, payload: {} } as any,
      { type: "runtime.interrupted", ts: new Date().toISOString(), trace: {}, payload: {} } as any,
    ];
    const result = HelmNativeRuntime.toResult(events);
    expect(result.status).toBe("cancelled");
  });

  it("resume dedupe: duplicate side-effect actionHash emits runtime.tool.deduped and does not dispatch tool (streamChat path)", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    const prev = { ...process.env };
    process.env.HELM_MODEL_TOOL_CAPABLE_ALLOWLIST = "llama3.2:latest";
    process.env.HELM_MODEL = "llama3.2:latest";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input); calls.push(url);
      if (url.includes("/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const hasToolResult = (body.messages ?? []).some((m: any) => m?.role === "tool");
        const sse = hasToolResult
          ? 'data: ' + JSON.stringify({ choices: [{ delta: { content: "done" } }] }) + '\n\n' + 'data: [DONE]\n\n'
          : 'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "browser_click", arguments: JSON.stringify({ sessionId: "s1", selector: "#buy", approvalId: "apr1", actionHash: "ah_done", idempotencyKey: "ik1" }) } }] } }] }) + '\n\n' + 'data: [DONE]\n\n';
        return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const events = await collect(new HelmNativeRuntime(), { ...base, kind: "assistant", prompt: "open browser and click buy", context: { activeBrowserSessionId: "s1", approvedActionKinds: ["external.high_risk"], approvedActionHashes: ["ah_done"], runtimeResumePlan: { version: 1, lastSafeBoundary: "runtime.tool.completed", completedToolRefs: [{ name: "browser_click", eventSeq: 1, actionHash: "ah_done", idempotencyKey: "ik_old" }], completedActionHashes: ["ah_done"] }, modelOverride: { provider: "ollama", model: "llama3.2:latest" } } } as any);
      expect(events.some((e) => e.type === "runtime.tool.deduped" && (e.payload as any)?.actionHash === "ah_done")).toBe(true);
      expect(calls.some((u) => u.includes("/v1/browser/sessions/s1/click"))).toBe(false);
      expect((events.at(-1)?.payload as any)?.status).toBe("succeeded");
    } finally { globalThis.fetch = originalFetch; process.env = prev; }
  });

  it("sensitive egress enforcement: denies non-local model when HELM_ENFORCE_SENSITIVE_EGRESS=1", async () => {
    const prev = { ...process.env };
    process.env.HELM_ENFORCE_SENSITIVE_EGRESS = "1";
    process.env.HELM_MODEL = "gpt-4.1-mini";
    process.env.HELM_MODEL_PROVIDER = "openai-compatible";
    process.env.HELM_MODEL_BASE_URL = "https://api.openai.com/v1";
    process.env.OPENAI_API_KEY = "test";
    try {
      const events = await collect(new HelmNativeRuntime(), { ...base, prompt: "summarize this", context: { modelSensitivity: "sensitive" } } as any);
      const failed = events.find((e) => e.type === "runtime.failed");
      expect((failed?.payload as any)?.code).toBe("POLICY_DENIED");
      expect((failed?.payload as any)?.guardrail).toBe("sensitive_egress");
    } finally { process.env = prev; }
  });
});
