import { createLogger } from "@helm/observability";

export const logger = createLogger({ name: "helm-api" });

export function requestLogger(requestId: string, correlationId: string, userId?: string) {
  return logger.child({ requestId, correlationId, ...(userId ? { userId } : {}) });
}