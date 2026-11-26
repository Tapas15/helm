import { describe, expect, it } from "vitest";
import { deriveRuntimeCheckpoint, isTerminalCheckpoint } from "./runtime-checkpoint.js";

const ts = "2026-11-26T00:00:00.000Z";
const trace = { taskId: "t1", runId: "r1" };

describe("runtime checkpoint", () => {
  it("tracks waiting_approval completion", () => {
    const cp = deriveRuntimeCheckpoint(null, { type: "runtime.completed", ts, trace, payload: { status: "waiting_approval", output: "wait" } } as any, 3);
    expect(cp.statusHint).toBe("waiting_approval");
    expect(cp.lastOutput).toBe("wait");
    expect(isTerminalCheckpoint(cp)).toBe(false);
  });

  it("tracks failed/interrupted as terminal", () => {
    const failed = deriveRuntimeCheckpoint(null, { type: "runtime.failed", ts, trace, payload: {} } as any, 1);
    expect(isTerminalCheckpoint(failed)).toBe(true);
    const interrupted = deriveRuntimeCheckpoint(null, { type: "runtime.interrupted", ts, trace, payload: {} } as any, 2);
    expect(isTerminalCheckpoint(interrupted)).toBe(true);
  });

  it("captures approval request metadata", () => {
    const cp = deriveRuntimeCheckpoint(null, { type: "runtime.approval.requested", ts, trace, payload: { approvalId: "apr1", actionHash: "ah1", summary: "needs approval" } } as any, 4);
    expect(cp.lastApproval?.approvalId).toBe("apr1");
    expect(cp.statusHint).toBe("running");
  });
});
