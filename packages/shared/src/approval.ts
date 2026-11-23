import { z } from "zod";

export const ApprovalStatus = z.enum(["pending", "approved", "rejected", "expired", "cancelled"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const ApprovalDecision = z.enum(["approve", "reject"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export const ApprovalRequest = z.object({
  id: z.string(),
  taskId: z.string(),
  runId: z.string().nullable(),
  actionKind: z.string(),
  actionHash: z.string(),
  status: ApprovalStatus,
  summary: z.string(),
  evidence: z.record(z.unknown()).default({}),
  requestedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  decisionReason: z.string().nullable(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

export const CreateApprovalInput = z.object({
  taskId: z.string(),
  runId: z.string().optional(),
  actionKind: z.string().min(1),
  actionHash: z.string().min(1),
  summary: z.string().min(1),
  evidence: z.record(z.unknown()).default({}),
});

export const ResolveApprovalInput = z.object({
  decision: ApprovalDecision,
  reason: z.string().optional(),
});
