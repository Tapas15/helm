import "dotenv/config";
import { createLogger } from "@helm/observability";
import { readTemporalConfig } from "@helm/shared";

async function ensureReconciliationSchedule(client: any, cfg: ReturnType<typeof readTemporalConfig>, log: ReturnType<typeof createLogger>) {
  if (process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED !== "1") {
    log.info({ scheduleId: cfg.reconciliationScheduleId }, "temporal reconciliation schedule disabled");
    return;
  }
  const scheduleId = cfg.reconciliationScheduleId;
  const intervalMs = Math.max(Number(process.env.HELM_RECONCILIATION_INTERVAL_MS ?? 60_000), 60_000);
  const olderThanMs = Math.max(Number(process.env.HELM_RECONCILIATION_OLDER_THAN_MS ?? 60_000), 0);
  const limit = Math.min(Math.max(Number(process.env.HELM_RECONCILIATION_LIMIT ?? 20), 1), 100);
  const schedule = client.schedule;
  const spec = { intervals: [{ every: `${Math.floor(intervalMs / 1000)}s` }] };
  const action = {
    type: "startWorkflow",
    workflowType: "helmReconciliationWorkflow",
    taskQueue: cfg.taskQueue,
    args: [{ limit, olderThanMs }],
    workflowId: `${scheduleId}-run`,
  };
  try {
    const handle = schedule.getHandle(scheduleId);
    await handle.describe();
    await handle.update((prev: any) => ({
      ...prev,
      spec,
      action: { ...(prev.action as Record<string, unknown> | undefined), ...action },
    }));
    log.info({ scheduleId, intervalMs, olderThanMs, limit }, "temporal reconciliation schedule updated");
  } catch {
    await schedule.create({
      scheduleId,
      spec,
      action,
      policies: { overlap: "SKIP", catchupWindow: "1m" },
      state: { note: "Helm uncertain receipt reconciliation; lookup-first, no blind retry" },
    });
    log.info({ scheduleId, intervalMs, olderThanMs, limit }, "temporal reconciliation schedule created");
  }
}

async function main() {
  const cfg = readTemporalConfig(process.env);
  const log = createLogger({ name: "helm-temporal-worker" });
  if (!cfg.enabled) {
    log.info({ temporal: cfg }, "Temporal disabled (HELM_TEMPORAL_ENABLED!=1); worker idle. DB worker remains active.");
    setInterval(() => {}, 1 << 30);
    return;
  }

  const { NativeConnection, Worker } = await import("@temporalio/worker");
  const { Client, Connection } = await import("@temporalio/client");
  const { createActivities } = await import("./activities.js");
  const { helmTaskQueue } = await import("./workflows.js");
  const connection = await NativeConnection.connect({ address: cfg.address });
  const clientConnection = await Connection.connect({ address: cfg.address });
  const client = new Client({ connection: clientConnection, namespace: cfg.namespace });
  try {
    await ensureReconciliationSchedule(client, cfg, log);
    const worker = await Worker.create({
      connection,
      namespace: cfg.namespace,
      taskQueue: cfg.taskQueue || helmTaskQueue,
      workflowsPath: new URL("./workflows.js", import.meta.url).pathname,
      activities: createActivities(),
    });
    log.info({ temporal: cfg }, "helm-temporal-worker started");
    await worker.run();
  } finally {
    await clientConnection.close().catch(() => undefined);
    await connection.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
