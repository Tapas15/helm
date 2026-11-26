import type { AgentRuntimeEvent } from "@helm/shared";

export type RuntimeResumePlan = {
  version: 1;
  lastSafeBoundary: string | null;
  pendingApproval?: { actionHash: string; actionKind?: string; approvalId?: string };
  completedToolRefs: Array<{ name: string; eventSeq: number; actionHash?: string; idempotencyKey?: string; argsKey?: string }>;
  completedActionHashes?: string[];
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
  if (["runtime.planning", "runtime.tool.completed", "runtime.tool.deduped", "runtime.approval.requested", "runtime.takeover.requested", "runtime.completed", "runtime.failed", "runtime.interrupted"].includes(evt.type)) {
    next.resumePlan = { ...next.resumePlan!, lastSafeBoundary: evt.type };
  }
  if (evt.type === "runtime.tool.completed") {
    const payload = (evt.payload as any) ?? {};
    const name = typeof payload?.name === "string" ? String(payload.name) : "unknown";
    const args = payload?.args && typeof payload.args === "object" ? payload.args : {};
    const actionHash = typeof args.actionHash === "string" && args.actionHash ? String(args.actionHash) : undefined;
    const idempotencyKey = typeof args.idempotencyKey === "string" && args.idempotencyKey ? String(args.idempotencyKey) : undefined;
    const argsKey = typeof payload.argsKey === "string" && payload.argsKey ? String(payload.argsKey) : (name.startsWith("browser_") ? (() => { try { const a = { ...(args as any) }; delete a.approvalId; delete a.actionHash; delete a.idempotencyKey; const keys = Object.keys(a).sort(); const out: any = {}; for (const k of keys) out[k] = a[k]; return JSON.stringify(out).slice(0, 500); } catch { return undefined; } })() : undefined);
    const refs = [...(next.resumePlan?.completedToolRefs ?? []), { name, eventSeq: seq, ...(actionHash ? { actionHash } : {}), ...(idempotencyKey ? { idempotencyKey } : {}), ...(argsKey ? { argsKey } : {}) }].slice(-20);
    const completedActionHashes = Array.from(new Set([...(next.resumePlan?.completedActionHashes ?? []), ...(actionHash ? [actionHash] : [])])).slice(-20);
    next.resumePlan = { ...next.resumePlan!, completedToolRefs: refs, completedActionHashes };
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
