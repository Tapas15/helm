export const TRACE_HEADER = {
    requestId: "x-request-id",
    correlationId: "x-correlation-id",
    causationId: "x-causation-id",
};
export function pickTraceFields(input) {
    if (!input)
        return {};
    const out = {};
    for (const key of [
        "requestId", "correlationId", "causationId", "taskId", "runId",
        "stepId", "sessionId", "userId", "agentId", "tool",
    ]) {
        const value = input[key];
        if (typeof value === "string" && value.length > 0)
            out[key] = value;
    }
    return out;
}
export function ensureTraceFields(input, generatedId) {
    const picked = pickTraceFields(input);
    const requestId = picked.requestId ?? generatedId();
    const correlationId = picked.correlationId ?? requestId;
    return { ...picked, requestId, correlationId };
}
//# sourceMappingURL=context.js.map