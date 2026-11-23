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
];
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
export function withTrace(payload, trace) {
    const defined = Object.fromEntries(Object.entries(trace).filter(([, value]) => value !== undefined));
    return { ...payload, ...defined };
}
//# sourceMappingURL=events.js.map