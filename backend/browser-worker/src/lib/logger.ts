import { createLogger } from "@helm/observability";

export const logger = createLogger({ name: "helm-browser-worker" });