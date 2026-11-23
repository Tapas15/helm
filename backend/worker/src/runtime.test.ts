import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HelmNativeRuntime } from "./runtime.js";

describe("HelmNativeRuntime model config", () => {
  const old = { ...process.env };
  beforeAll(() => { delete process.env.HELM_MODEL_BASE_URL; delete process.env.HELM_MODEL; delete process.env.OPENAI_API_KEY; delete process.env.OLLAMA_BASE_URL; });
  afterAll(() => { process.env = old; });
  it("falls back when no model configured", async () => {
    const rt = new HelmNativeRuntime();
    const events: any[] = [];
    for await (const e of rt.run({ taskId: "t1", runId: "r1", userId: "u1", prompt: "hello", kind: "assistant", context: {}, trace: {} })) events.push(e);
    const done = events.find((e) => e.type === "runtime.completed");
    expect(done?.payload?.status).toBe("succeeded");
    expect(String(done?.payload?.output ?? "")).toContain("Configure HELM_MODEL");
  });
});
