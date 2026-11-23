export declare const TRACE_HEADER: {
    readonly requestId: "x-request-id";
    readonly correlationId: "x-correlation-id";
    readonly causationId: "x-causation-id";
};
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
export declare function pickTraceFields(input: Partial<TraceFields> | undefined): TraceFields;
export declare function ensureTraceFields(input: Partial<TraceFields> | undefined, generatedId: () => string): Required<Pick<TraceFields, "requestId" | "correlationId">> & TraceFields;
//# sourceMappingURL=context.d.ts.map