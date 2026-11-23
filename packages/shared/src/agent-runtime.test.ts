import { describe, expect, it } from "vitest";
import { AgentRuntimeEvent, AgentRuntimeInput, AgentRuntimeResult } from "./agent-runtime.js";

describe("agent runtime contract", () => {
  it("parses runtime input", () => {
    const parsed = AgentRuntimeInput.parse({ taskId: "t1", runId: "r1", userId: "u1", prompt: "hi" });
    expect(parsed.kind).toBe("assistant");
    expect(parsed.context).toEqual({});
  });

  it("parses runtime events", () => {
    const evt = AgentRuntimeEvent.parse({ type: "runtime.started", ts: new Date().toISOString(), payload: { step: 1 } });
    expect(evt.type).toBe("runtime.started");
  });

  it("parses runtime result", () => {
    const res = AgentRuntimeResult.parse({ status: "succeeded", output: "ok" });
    expect(res.status).toBe("succeeded");
  });
});
