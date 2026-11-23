import { createDb } from "@helm/db";
import { createLogger } from "@helm/observability";

export function createActivities() {
  const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";
  const { db } = createDb(dbUrl);
  const log = createLogger({ name: "helm-temporal-activities" });

  return {
    async executeApprovedAction(input: { taskId: string; userId: string; actionKind: string; actionHash: string; idempotencyKey: string; approvalId: string; payload: Record<string, unknown> }) {
      // P5-B scaffold: delegate to existing guarded API/service path in P5-C.
      // For now, record intent only; do not execute external side effects here.
      log.warn({ taskId: input.taskId, actionKind: input.actionKind, approvalId: input.approvalId }, "Temporal activity scaffold invoked; execution delegated to P5-C");
      return { receiptId: `pending_${input.idempotencyKey}`, status: "not_implemented" };
    },
  };
}
