import { z } from "zod";

export const TemporalMode = z.enum(["off", "external-write", "all"]);
export type TemporalMode = z.infer<typeof TemporalMode>;

export const TemporalConfig = z.object({
  enabled: z.boolean().default(false),
  mode: TemporalMode.default("off"),
  address: z.string().default("localhost:7233"),
  namespace: z.string().default("default"),
  taskQueue: z.string().default("helm-main"),
  reconciliationScheduleId: z.string().default("helm-reconciliation-schedule"),
});
export type TemporalConfig = z.infer<typeof TemporalConfig>;

export function readTemporalConfig(env: NodeJS.ProcessEnv = process.env): TemporalConfig {
  const enabled = env.HELM_TEMPORAL_ENABLED === "1" || env.HELM_TEMPORAL_ENABLED === "true";
  const modeRaw = env.HELM_TEMPORAL_MODE ?? (enabled ? "external-write" : "off");
  const mode = TemporalMode.safeParse(modeRaw).success ? (modeRaw as TemporalMode) : "off";
  return TemporalConfig.parse({
    enabled,
    mode,
    address: env.TEMPORAL_ADDRESS ?? "localhost:7233",
    namespace: env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: env.TEMPORAL_TASK_QUEUE ?? "helm-main",
    reconciliationScheduleId: env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ID ?? "helm-reconciliation-schedule",
  });
}

export function shouldUseTemporalForAction(config: TemporalConfig, actionKind: string): boolean {
  if (!config.enabled || config.mode === "off") return false;
  if (config.mode === "all") return true;
  // external-write mode: only approval-gated/external side effects
  return /^(gmail\.send|calendar\.create_event|browser\.external_action|external\.)/.test(actionKind);
}
