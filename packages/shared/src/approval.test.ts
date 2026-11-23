import { describe, expect, it } from "vitest";
import { ApprovalRequest, CreateApprovalInput, ResolveApprovalInput } from "./approval.js";

describe("approval contract", () => {
  it("parses create input", () => {
    const p = CreateApprovalInput.parse({ taskId: "t1", actionKind: "external.high_risk", actionHash: "h1", summary: "needs approval" });
    expect(p.evidence).toEqual({});
  });
  it("parses resolve input", () => {
    expect(ResolveApprovalInput.parse({ decision: "approve" }).decision).toBe("approve");
  });
  it("parses approval request", () => {
    const a = ApprovalRequest.parse({ id: "a1", taskId: "t1", runId: "r1", actionKind: "x", actionHash: "h", status: "pending", summary: "s", evidence: {}, requestedAt: new Date().toISOString(), resolvedAt: null, decisionReason: null });
    expect(a.status).toBe("pending");
  });
});
