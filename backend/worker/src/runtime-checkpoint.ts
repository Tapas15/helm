import type { AgentRuntimeEvent } from "@helm/shared";

export type RuntimeResumePlan = {
  version: 1;
  lastSafeBoundary: string | null;
  pendingApproval?: { actionHash: string; actionKind?: string; approvalId?: string };
  completedToolRefs: Array<{ name: string; eventSeq: number }>;
};

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
  resumePlan?: RuntimeResumePlan;
};

export function deriveRuntimeCheckpoint(prev: RuntimeCheckpoint | null, evt: AgentRuntimeEvent, seq: number): RuntimeCheckpoint {
  const base: RuntimeCheckpoint = prev ?? {
    version: 1, runId: String(evt.trace?.runId ?? ""), taskId: String(evt.trace?.taskId ?? ""),
    lastEventSeq: -1, lastEventType: null, updatedAt: evt.ts, statusHint: "running",
    resumePlan: { version: 1, lastSafeBoundary: null, completedToolRefs: [] },
  };
  const next: RuntimeCheckpoint = {
    ...base,
    lastEventSeq: seq,
    lastEventType: evt.type,
    updatedAt: evt.ts,
    resumePlan: base.resumePlan ?? { version: 1, lastSafeBoundary: null, completedToolRefs: [] },
  };
  if (["runtime.planning", "runtime.tool.completed", "runtime.approval.requested", "runtime.takeover.requested", "runtime.completed", "runtime.failed", "runtime.interrupted"].includes(evt.type)) {
    next.resumePlan = { ...next.resumePlan!, lastSafeBoundary: evt.type };
  }
  if (evt.type === "runtime.tool.completed") {
    const name = typeof (evt.payload as any)?.name === "string" ? String((evt.payload as any).name) : "unknown";
    const refs = [...(next.resumePlan?.completedToolRefs ?? []), { name, eventSeq: seq }].slice(-20);
    next.resumePlan = { ...next.resumePlan!, completedToolRefs: refs };
  }
  if (evt.type === "runtime.completed") {
    const status = String((evt.payload as any)?.status ?? "succeeded");
    next.statusHint = status === "waiting_approval" ? "waiting_approval" : status === "waiting_input" ? "waiting_input" : status === "failed" ? "failed" : "completed";
    const out = (evt.payload as any)?.output;
    if (typeof out === "string" && out) next.lastOutput = out.slice(0, 2000);
    if (status !== "waiting_approval") next.resumePlan = { ...next.resumePlan!, pendingApproval: undefined };
  } else if (evt.type === "runtime.failed") {
    next.statusHint = "failed";
    next.resumePlan = { ...next.resumePlan!, pendingApproval: undefined };
  } else if (evt.type === "runtime.interrupted") {
    next.statusHint = "interrupted";
  } else if (evt.type === "runtime.approval.requested") {
    next.lastApproval = {
      approvalId: typeof (evt.payload as any)?.approvalId === "string" ? (evt.payload as any).approvalId : undefined,
      actionHash: typeof (evt.payload as any)?.actionHash === "string" ? (evt.payload as any).actionHash : undefined,
      summary: typeof (evt.payload as any)?.summary === "string" ? (evt.payload as any).summary : undefined,
    };
    const actionHash = next.lastApproval.actionHash;
    if (actionHash) next.resumePlan = { ...next.resumePlan!, pendingApproval: { actionHash, actionKind: typeof (evt.payload as any)?.actionKind === "string" ? (evt.payload as any).actionKind : undefined, approvalId: next.lastApproval.approvalId } };
  }
  return next;
}

export function isTerminalCheckpoint(cp: RuntimeCheckpoint | null | undefined): boolean {
  return !!cp && ["completed", "failed", "interrupted"].includes(cp.statusHint);
}
