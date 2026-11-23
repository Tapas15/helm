import { z } from "zod";
export const HELM_ERROR_CODES = {
    INTERNAL_ERROR: "INTERNAL_ERROR",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    NOT_FOUND: "NOT_FOUND",
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    CONFLICT: "CONFLICT",
    INVALID_TRANSITION: "INVALID_TRANSITION",
    NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
    TIMEOUT: "TIMEOUT",
    DEPENDENCY_ERROR: "DEPENDENCY_ERROR",
};
export const HelmErrorSchema = z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    cause: z.unknown().optional(),
    context: z.record(z.unknown()).optional(),
    traceId: z.string().optional(),
    correlationId: z.string().optional(),
    taskId: z.string().optional(),
    stepId: z.string().optional(),
});
export class HelmError extends Error {
    code;
    retryable;
    cause;
    context;
    traceId;
    correlationId;
    taskId;
    stepId;
    constructor(options) {
        super(options.message);
        this.name = "HelmError";
        this.code = options.code;
        this.retryable = options.retryable ?? false;
        this.cause = options.cause;
        this.context = options.context;
        this.traceId = options.traceId;
        this.correlationId = options.correlationId;
        this.taskId = options.taskId;
        this.stepId = options.stepId;
    }
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            retryable: this.retryable,
            ...(this.cause !== undefined ? { cause: serializeCause(this.cause) } : {}),
            ...(this.context !== undefined ? { context: this.context } : {}),
            ...(this.traceId !== undefined ? { traceId: this.traceId } : {}),
            ...(this.correlationId !== undefined ? { correlationId: this.correlationId } : {}),
            ...(this.taskId !== undefined ? { taskId: this.taskId } : {}),
            ...(this.stepId !== undefined ? { stepId: this.stepId } : {}),
        };
    }
}
export function serializeCause(cause) {
    if (cause instanceof HelmError)
        return cause.toJSON();
    if (cause instanceof Error) {
        return { name: cause.name, message: cause.message };
    }
    return cause;
}
export function createHelmError(options) {
    return new HelmError(options);
}
export function isHelmError(value) {
    return value instanceof HelmError;
}
export function toHelmError(value, fallback = {
    code: HELM_ERROR_CODES.INTERNAL_ERROR,
    message: "Internal server error",
    retryable: true,
}) {
    if (value instanceof HelmError)
        return value;
    if (value instanceof Error) {
        return new HelmError({
            ...fallback,
            message: fallback.message || value.message,
            cause: value,
        });
    }
    return new HelmError({ ...fallback, cause: value });
}
export function helmErrorToApiError(error) {
    return {
        error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            ...(error.context !== undefined ? { details: error.context } : {}),
        },
    };
}
//# sourceMappingURL=errors.js.map