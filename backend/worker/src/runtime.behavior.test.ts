import { describe, expect, it } from "vitest";
import { HelmNativeRuntime } from "./runtime.js";

const base = { taskId: "t1", runId: "r1", userId: "u1", kind: "assistant" as const, prompt: "hello", context: {}, trace: { taskId: "t1", runId: "r1", userId: "u1" }, thread: [] };

describe("HelmNativeRuntime", () => {
  it("emits waiting_approval for high-risk prompt without approval", async () => {
    const rt = new HelmNativeRuntime();
    const events = [] as any[];
    for await (const e of rt.run({ ...base, prompt: "please buy a domain" })) events.push(e);
    const completed = events.find(e => e.type === "runtime.completed");
    expect(completed?.payload?.status).toBe("waiting_approval");
  });
  it("completes normally when approval granted in context", async () => {
    const rt = new HelmNativeRuntime();
    const events = [] as any[];
    for await (const e of rt.run({ ...base, prompt: "please buy a domain", context: { approvalGranted: true } })) events.push(e);
    const completed = events.find(e => e.type === "runtime.completed");
    expect(completed?.payload?.status).toBe("succeeded");
  });
});
