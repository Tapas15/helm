import type { HelmLogger } from "@helm/observability";

export type AuthMethod = "dev_header" | "session_token" | "system";

export type AppEnv = {
  Variables: {
    userId: string;
    sessionId?: string;
    authMethod: AuthMethod;
    requestId: string;
    correlationId: string;
    causationId?: string;
    logger: HelmLogger;
  };
};