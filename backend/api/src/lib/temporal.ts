import { readTemporalConfig, shouldUseTemporalForAction } from "@helm/shared";

let clientPromise: Promise<any> | null = null;

async function getClient() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const cfg = readTemporalConfig(process.env);
    const { Connection, Client } = await import("@temporalio/client");
    const connection = await Connection.connect({ address: cfg.address });
    return { client: new Client({ connection, namespace: cfg.namespace }), cfg };
  })();
  return clientPromise;
}

export async function maybeStartExternalActionWorkflow(input: {
  taskId: string; userId: string; actionKind: string; actionHash: string; idempotencyKey: string;
  approvalId: string; payload: Record<string, unknown>;
}): Promise<{ started: boolean; workflowId?: string; runId?: string }> {
  const cfg = readTemporalConfig(process.env);
  if (!shouldUseTemporalForAction(cfg, input.actionKind)) return { started: false };
  const { client, cfg: c } = await getClient();
  const workflowId = `helm-ext-${input.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180)}`;
  const handle = await client.workflow.start("helmExternalActionWorkflow", {
    taskQueue: c.taskQueue,
    workflowId,
    args: [{ taskId: input.taskId, userId: input.userId, actionKind: input.actionKind, actionHash: input.actionHash, idempotencyKey: input.idempotencyKey, payload: input.payload }],
  });
  await handle.signal("approve", input.approvalId);
  return { started: true, workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
}
