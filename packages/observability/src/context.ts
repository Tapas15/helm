export const TRACE_HEADER = {
  requestId: "x-request-id",
  correlationId: "x-correlation-id",
  causationId: "x-causation-id",
} as const;

export interface TraceFields {
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  taskId?: string;
  runId?: string;
  stepId?: string;
  sessionId?: string;
  userId?: string;
  agentId?: string;
  tool?: string;
}

export function pickTraceFields(input: Partial<TraceFields> | undefined): TraceFields {
  if (!input) return {};
  const out: TraceFields = {};
  for (const key of [
    "requestId", "correlationId", "causationId", "taskId", "runId",
    "stepId", "sessionId", "userId", "agentId", "tool",
  ] as const) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

export function ensureTraceFields(input: Partial<TraceFields> | undefined, generatedId: () => string): Required<Pick<TraceFields, "requestId" | "correlationId">> & TraceFields {
  const picked = pickTraceFields(input);
  const requestId = picked.requestId ?? generatedId();
  const correlationId = picked.correlationId ?? requestId;
  return { ...picked, requestId, correlationId };
}