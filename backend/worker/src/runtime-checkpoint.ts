import type { AgentRuntimeEvent } from "@helm/shared";

export type RuntimeCheckpoint = {
  version: 1;
  runId: string;
  taskId: string;
  lastEventSeq: number;
  lastEventType: string | null;
  updatedAt: string;
  statusHint: "running" | "waiting_approval" | "waiting_input" | "completed" | "failed" | "interrupted" | "unknown";
  lastOutput?: string;
  lastApproval?: { approvalId?: string; actionHash?: string; summary?: string };
};

export function deriveRuntimeCheckpoint(prev: RuntimeCheckpoint | null, evt: AgentRuntimeEvent, seq: number): RuntimeCheckpoint {
  const base: RuntimeCheckpoint = prev ?? {
    version: 1, runId: String(evt.trace?.runId ?? ""), taskId: String(evt.trace?.taskId ?? ""),
    lastEventSeq: -1, lastEventType: null, updatedAt: evt.ts, statusHint: "running",
  };
  const next: RuntimeCheckpoint = { ...base, lastEventSeq: seq, lastEventType: evt.type, updatedAt: evt.ts };
  if (evt.type === "runtime.completed") {
    const status = String((evt.payload as any)?.status ?? "succeeded");
    next.statusHint = status === "waiting_approval" ? "waiting_approval" : status === "waiting_input" ? "waiting_input" : status === "failed" ? "failed" : "completed";
    const out = (evt.payload as any)?.output;
    if (typeof out === "string" && out) next.lastOutput = out.slice(0, 2000);
  } else if (evt.type === "runtime.failed") {
    next.statusHint = "failed";
  } else if (evt.type === "runtime.interrupted") {
    next.statusHint = "interrupted";
  } else if (evt.type === "runtime.approval.requested") {
    next.lastApproval = {
      approvalId: typeof (evt.payload as any)?.approvalId === "string" ? (evt.payload as any).approvalId : undefined,
      actionHash: typeof (evt.payload as any)?.actionHash === "string" ? (evt.payload as any).actionHash : undefined,
      summary: typeof (evt.payload as any)?.summary === "string" ? (evt.payload as any).summary : undefined,
    };
  }
  return next;
}

export function isTerminalCheckpoint(cp: RuntimeCheckpoint | null | undefined): boolean {
  return !!cp && ["completed", "failed", "interrupted"].includes(cp.statusHint);
}
