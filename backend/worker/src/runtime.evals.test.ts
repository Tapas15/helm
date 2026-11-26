import { describe, expect, it } from "vitest";
import { HelmNativeRuntime } from "./runtime.js";
import type { AgentRuntime, AgentRuntimeEvent, AgentRuntimeInput } from "@helm/shared";

const base: AgentRuntimeInput = { taskId: "t1", runId: "r1", userId: "u1", kind: "assistant", prompt: "hello", context: {}, trace: { taskId: "t1", runId: "r1", userId: "u1" }, thread: [] } as any;

async function collect(rt: AgentRuntime, input: AgentRuntimeInput) {
  const events: AgentRuntimeEvent[] = [];
  for await (const e of rt.run(input)) events.push(e);
  return events;
}

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
});
