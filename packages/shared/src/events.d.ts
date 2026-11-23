import { z } from "zod";
export declare const HELM_TRACE_FIELDS: readonly ["requestId", "correlationId", "causationId", "taskId", "runId", "stepId", "sessionId", "userId", "agentId", "tool"];
export type HelmTraceField = (typeof HELM_TRACE_FIELDS)[number];
export declare const TraceContext: z.ZodObject<{
    requestId: z.ZodOptional<z.ZodString>;
    correlationId: z.ZodOptional<z.ZodString>;
    causationId: z.ZodOptional<z.ZodString>;
    taskId: z.ZodOptional<z.ZodString>;
    runId: z.ZodOptional<z.ZodString>;
    stepId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
    agentId: z.ZodOptional<z.ZodString>;
    tool: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    userId?: string | undefined;
    taskId?: string | undefined;
    runId?: string | undefined;
    sessionId?: string | undefined;
    correlationId?: string | undefined;
    causationId?: string | undefined;
    stepId?: string | undefined;
    requestId?: string | undefined;
    agentId?: string | undefined;
    tool?: string | undefined;
}, {
    userId?: string | undefined;
    taskId?: string | undefined;
    runId?: string | undefined;
    sessionId?: string | undefined;
    correlationId?: string | undefined;
    causationId?: string | undefined;
    stepId?: string | undefined;
    requestId?: string | undefined;
    agentId?: string | undefined;
    tool?: string | undefined;
}>;
export type TraceContext = z.infer<typeof TraceContext>;
export declare function withTrace<T extends Record<string, unknown>>(payload: T, trace: TraceContext): T & TraceContext;
//# sourceMappingURL=events.d.ts.map