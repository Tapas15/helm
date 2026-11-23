import "dotenv/config";
import { createLogger } from "@helm/observability";
import { readTemporalConfig } from "@helm/shared";

async function main() {
  const cfg = readTemporalConfig(process.env);
  const log = createLogger({ name: "helm-temporal-worker" });
  if (!cfg.enabled) {
    log.info({ temporal: cfg }, "Temporal disabled (HELM_TEMPORAL_ENABLED!=1); worker idle. DB worker remains active.");
    setInterval(() => {}, 1 << 30);
    return;
  }

  const { NativeConnection, Worker } = await import("@temporalio/worker");
  const { createActivities } = await import("./activities.js");
  const { helmTaskQueue } = await import("./workflows.js");
  const connection = await NativeConnection.connect({ address: cfg.address });
  try {
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
    await connection.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
