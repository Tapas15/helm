import { defineSignal, defineQuery, proxyActivities, setHandler, condition } from "@temporalio/workflow";

export const helmTaskQueue = "helm-main";

export type HelmTaskWorkflowInput = {
  taskId: string;
  userId: string;
  actionKind: string;
  actionHash: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

export type HelmTaskWorkflowState = {
  status: "pending" | "waiting_approval" | "running" | "succeeded" | "failed" | "cancelled";
  approvalId?: string;
  receiptId?: string;
  error?: string;
};

export const approveSignal = defineSignal<[string]>("approve");
export const rejectSignal = defineSignal<[string]>("reject");
export const cancelSignal = defineSignal("cancel");
export const statusQuery = defineQuery<HelmTaskWorkflowState>("getStatus");

const activities = proxyActivities<{
  executeApprovedAction(input: HelmTaskWorkflowInput & { approvalId: string }): Promise<{ receiptId: string; status: string; externalRef?: string | null; raw?: unknown }>;
  reconcileUncertainReceiptsActivity(input: { limit?: number; olderThanMs?: number }): Promise<{ scanned: number; reconciled: number; failed: number; skipped: number }>;
}>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 3,
    nonRetryableErrorTypes: ["PolicyDenied", "ValidationError", "ApprovalRejected", "Forbidden", "NotFound"],
  },
});

export async function helmExternalActionWorkflow(input: HelmTaskWorkflowInput): Promise<HelmTaskWorkflowState> {
  const state: HelmTaskWorkflowState = { status: "waiting_approval" };
  let approved = false;
  let rejectedReason: string | undefined;
  let cancelled = false;

  setHandler(statusQuery, () => state);
  setHandler(approveSignal, (approvalId: string) => { state.approvalId = approvalId; approved = true; });
  setHandler(rejectSignal, (reason: string) => { rejectedReason = reason || "rejected"; });
  setHandler(cancelSignal, () => { cancelled = true; });

  await condition(() => approved || !!rejectedReason || cancelled, "24 hours");
  if (cancelled) { state.status = "cancelled"; return state; }
  if (rejectedReason) { state.status = "failed"; state.error = `approval_rejected:${rejectedReason}`; return state; }
  if (!state.approvalId) { state.status = "failed"; state.error = "missing_approval_id"; return state; }

  state.status = "running";
  try {
    const result = await activities.executeApprovedAction({ ...input, approvalId: state.approvalId });
    state.receiptId = result.receiptId;
    if (result.status === "executed") state.status = "succeeded";
    else if (result.status === "uncertain") { state.status = "failed"; state.error = "uncertain_external_outcome"; }
    else { state.status = "failed"; state.error = `execution_${result.status}`; }
    return state;
  } catch (e) {
    state.status = "failed";
    state.error = e instanceof Error ? e.message : String(e);
    return state;
  }
}


export type ReconciliationWorkflowInput = { limit?: number; olderThanMs?: number };
export async function helmReconciliationWorkflow(input: ReconciliationWorkflowInput = {}): Promise<{ scanned: number; reconciled: number; failed: number; skipped: number }> {
  return activities.reconcileUncertainReceiptsActivity(input);
}
