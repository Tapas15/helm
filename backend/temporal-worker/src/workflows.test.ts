import { describe, expect, it, vi, beforeEach } from "vitest";

const { state, captured } = vi.hoisted(() => {
  const state = {
    approved: null as string | null,
    rejected: null as string | null,
    cancelled: false,
  };
  const captured = {
    handlers: new Map<string, Function>(),
    activityOptions: null as any,
    executeApprovedAction: vi.fn(),
    reconcileUncertainReceiptsActivity: vi.fn(),
  };
  return { state, captured };
});

vi.mock("@temporalio/workflow", () => ({
  defineSignal: (name: string) => ({ __signal: name }),
  defineQuery: (name: string) => ({ __query: name }),
  proxyActivities: (opts: any) => {
    captured.activityOptions = opts;
    return {
      executeApprovedAction: captured.executeApprovedAction,
      reconcileUncertainReceiptsActivity: captured.reconcileUncertainReceiptsActivity,
    };
  },
  setHandler: (def: any, fn: Function) => {
    captured.handlers.set(def.__signal ?? def.__query, fn);
  },
  condition: async (pred: () => boolean) => {
    if (state.approved) { const h = captured.handlers.get("approve"); h?.(state.approved); }
    if (state.rejected) { const h = captured.handlers.get("reject"); h?.(state.rejected); }
    if (state.cancelled) { const h = captured.handlers.get("cancel"); h?.(); }
    return pred();
  },
}));

import { helmExternalActionWorkflow, helmReconciliationWorkflow } from "./workflows.js";

const initialActivityOptions = captured.activityOptions;

const baseInput = {
  taskId: "tsk_1",
  userId: "usr_1",
  actionKind: "gmail.send",
  actionHash: "ah_1",
  idempotencyKey: "idem_1",
  payload: { accountId: "cac_1", to: ["a@b.com"], subject: "s", bodyText: "b" },
};

describe("temporal workflows (P5 deterministic policy contracts)", () => {
  beforeEach(() => {
    captured.handlers.clear();
    captured.executeApprovedAction.mockReset();
    captured.reconcileUncertainReceiptsActivity.mockReset();
    state.approved = null;
    state.rejected = null;
    state.cancelled = false;
  });

  it("configures non-retryable Temporal error types for external action activities", () => {
    expect(initialActivityOptions).toMatchObject({ startToCloseTimeout: "2 minutes" });
    expect(initialActivityOptions.retry.maximumAttempts).toBe(3);
    expect(initialActivityOptions.retry.nonRetryableErrorTypes).toEqual(
      expect.arrayContaining(["PolicyDenied", "ValidationError", "ApprovalRejected", "Forbidden", "NotFound"]),
    );
  });

  it("returns failed approval_rejected without executing activity", async () => {
    state.rejected = "user_denied";
    const out = await helmExternalActionWorkflow(baseInput as any);
    expect(out.status).toBe("failed");
    expect(out.error).toContain("approval_rejected:user_denied");
    expect(captured.executeApprovedAction).not.toHaveBeenCalled();
  });

  it("returns cancelled without executing activity", async () => {
    state.cancelled = true;
    const out = await helmExternalActionWorkflow(baseInput as any);
    expect(out).toEqual({ status: "cancelled" });
    expect(captured.executeApprovedAction).not.toHaveBeenCalled();
  });

  it("executes approved action and maps executed status to succeeded", async () => {
    state.approved = "apr_1";
    captured.executeApprovedAction.mockResolvedValueOnce({ receiptId: "rcpt_1", status: "executed", externalRef: "msg_1" });
    const out = await helmExternalActionWorkflow(baseInput as any);
    expect(captured.executeApprovedAction).toHaveBeenCalledWith({ ...baseInput, approvalId: "apr_1" });
    expect(out).toMatchObject({ status: "succeeded", approvalId: "apr_1", receiptId: "rcpt_1" });
  });

  it("maps uncertain activity outcome to failed uncertain_external_outcome (no blind retry in workflow)", async () => {
    state.approved = "apr_1";
    captured.executeApprovedAction.mockResolvedValueOnce({ receiptId: "rcpt_u", status: "uncertain" });
    const out = await helmExternalActionWorkflow(baseInput as any);
    expect(out).toMatchObject({ status: "failed", approvalId: "apr_1", receiptId: "rcpt_u", error: "uncertain_external_outcome" });
  });

  it("maps non-executed/non-uncertain status to failed execution_<status>", async () => {
    state.approved = "apr_1";
    captured.executeApprovedAction.mockResolvedValueOnce({ receiptId: "rcpt_f", status: "failed" });
    const out = await helmExternalActionWorkflow(baseInput as any);
    expect(out).toMatchObject({ status: "failed", receiptId: "rcpt_f", error: "execution_failed" });
  });

  it("captures activity throw as failed error", async () => {
    state.approved = "apr_1";
    captured.executeApprovedAction.mockRejectedValueOnce(new Error("boom"));
    const out = await helmExternalActionWorkflow(baseInput as any);
    expect(out).toMatchObject({ status: "failed", approvalId: "apr_1", error: "boom" });
  });

  it("helmReconciliationWorkflow delegates to reconciliation activity with input", async () => {
    captured.reconcileUncertainReceiptsActivity.mockResolvedValueOnce({ scanned: 1, reconciled: 1, failed: 0, skipped: 0 });
    const out = await helmReconciliationWorkflow({ limit: 5, olderThanMs: 1000 });
    expect(captured.reconcileUncertainReceiptsActivity).toHaveBeenCalledWith({ limit: 5, olderThanMs: 1000 });
    expect(out).toEqual({ scanned: 1, reconciled: 1, failed: 0, skipped: 0 });
  });
});
