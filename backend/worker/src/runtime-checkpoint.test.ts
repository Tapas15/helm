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

  it("captures approval request metadata and resume plan", () => {
    const cp = deriveRuntimeCheckpoint(null, { type: "runtime.approval.requested", ts, trace, payload: { approvalId: "apr1", actionHash: "ah1", actionKind: "external.high_risk", summary: "needs approval" } } as any, 4);
    expect(cp.lastApproval?.approvalId).toBe("apr1");
    expect(cp.resumePlan?.pendingApproval?.actionHash).toBe("ah1");
    expect(cp.resumePlan?.lastSafeBoundary).toBe("runtime.approval.requested");
  });

  it("records completed tool refs in bounded resume plan", () => {
    const cp = deriveRuntimeCheckpoint(null, { type: "runtime.tool.completed", ts, trace, payload: { name: "browser_snapshot" } } as any, 5);
    expect(cp.resumePlan?.completedToolRefs).toEqual([{ name: "browser_snapshot", eventSeq: 5 }]);
  });
});
