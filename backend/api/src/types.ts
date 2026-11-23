import type { HelmLogger } from "@helm/observability";

export type AppEnv = {
  Variables: {
    userId: string;
    requestId: string;
    correlationId: string;
    causationId?: string;
    logger: HelmLogger;
  };
};