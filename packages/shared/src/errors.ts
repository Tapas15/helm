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
} as const;

export type HelmErrorCode = keyof typeof HELM_ERROR_CODES | (string & {});

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

export class HelmError extends Error implements HelmErrorShape {
  readonly code: string;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly stepId?: string;

  constructor(options: HelmErrorOptions) {
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

  toJSON(): HelmErrorShape {
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

export function serializeCause(cause: unknown): unknown {
  if (cause instanceof HelmError) return cause.toJSON();
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message };
  }
  return cause;
}

export function createHelmError(options: HelmErrorOptions): HelmError {
  return new HelmError(options);
}

export function isHelmError(value: unknown): value is HelmError {
  return value instanceof HelmError;
}

export function toHelmError(
  value: unknown,
  fallback: HelmErrorOptions = {
    code: HELM_ERROR_CODES.INTERNAL_ERROR,
    message: "Internal server error",
    retryable: true,
  },
): HelmError {
  if (value instanceof HelmError) return value;
  if (value instanceof Error) {
    return new HelmError({
      ...fallback,
      message: fallback.message || value.message,
      cause: value,
    });
  }
  return new HelmError({ ...fallback, cause: value });
}

export function helmErrorToApiError(error: HelmErrorShape): {
  error: { code: string; message: string; retryable: boolean; details?: unknown };
} {
  return {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.context !== undefined ? { details: error.context } : {}),
    },
  };
}