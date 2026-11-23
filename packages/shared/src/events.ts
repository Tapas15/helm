import { z } from "zod";

export const HELM_TRACE_FIELDS = [
  "requestId",
  "correlationId",
  "causationId",
  "taskId",
  "runId",
  "stepId",
  "sessionId",
  "userId",
  "agentId",
  "tool",
] as const;

export type HelmTraceField = (typeof HELM_TRACE_FIELDS)[number];

export const TraceContext = z.object({
  requestId: z.string().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  taskId: z.string().optional(),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  agentId: z.string().optional(),
  tool: z.string().optional(),
});

export type TraceContext = z.infer<typeof TraceContext>;

export function withTrace<T extends Record<string, unknown>>(
  payload: T,
  trace: TraceContext,
): T & TraceContext {
  const defined = Object.fromEntries(
    Object.entries(trace).filter(([, value]) => value !== undefined),
  );
  return { ...payload, ...defined } as T & TraceContext;
}