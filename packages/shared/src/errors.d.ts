import { z } from "zod";
export declare const HELM_ERROR_CODES: {
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly CONFLICT: "CONFLICT";
    readonly INVALID_TRANSITION: "INVALID_TRANSITION";
    readonly NOT_IMPLEMENTED: "NOT_IMPLEMENTED";
    readonly TIMEOUT: "TIMEOUT";
    readonly DEPENDENCY_ERROR: "DEPENDENCY_ERROR";
};
export type HelmErrorCode = keyof typeof HELM_ERROR_CODES | (string & {});
export declare const HelmErrorSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    retryable: z.ZodBoolean;
    cause: z.ZodOptional<z.ZodUnknown>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    traceId: z.ZodOptional<z.ZodString>;
    correlationId: z.ZodOptional<z.ZodString>;
    taskId: z.ZodOptional<z.ZodString>;
    stepId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    retryable: boolean;
    taskId?: string | undefined;
    correlationId?: string | undefined;
    cause?: unknown;
    context?: Record<string, unknown> | undefined;
    traceId?: string | undefined;
    stepId?: string | undefined;
}, {
    code: string;
    message: string;
    retryable: boolean;
    taskId?: string | undefined;
    correlationId?: string | undefined;
    cause?: unknown;
    context?: Record<string, unknown> | undefined;
    traceId?: string | undefined;
    stepId?: string | undefined;
}>;
export type HelmErrorShape = z.infer<typeof HelmErrorSchema>;
export interface HelmErrorOptions {
    code: HelmErrorCode;
    message: string;
    retryable?: boolean;
    cause?: unknown;
    context?: Record<string, unknown>;
    traceId?: string;
    correlationId?: string;
    taskId?: string;
    stepId?: string;
}
export declare class HelmError extends Error implements HelmErrorShape {
    readonly code: string;
    readonly retryable: boolean;
    readonly cause?: unknown;
    readonly context?: Record<string, unknown>;
    readonly traceId?: string;
    readonly correlationId?: string;
    readonly taskId?: string;
    readonly stepId?: string;
    constructor(options: HelmErrorOptions);
    toJSON(): HelmErrorShape;
}
export declare function serializeCause(cause: unknown): unknown;
export declare function createHelmError(options: HelmErrorOptions): HelmError;
export declare function isHelmError(value: unknown): value is HelmError;
export declare function toHelmError(value: unknown, fallback?: HelmErrorOptions): HelmError;
export declare function helmErrorToApiError(error: HelmErrorShape): {
    error: {
        code: string;
        message: string;
        retryable: boolean;
        details?: unknown;
    };
};
//# sourceMappingURL=errors.d.ts.map