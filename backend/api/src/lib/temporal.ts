import { readTemporalConfig, shouldUseTemporalForAction } from "@helm/shared";

let clientPromise: Promise<any> | null = null;
const stubWorkflows = new Map<string, { workflowId: string; runId: string; signals: string[]; args: unknown }>();

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

export function __resetTemporalStubForTests() { stubWorkflows.clear(); clientPromise = null; }
export function __getTemporalStubState() { return Array.from(stubWorkflows.values()); }

export async function maybeStartExternalActionWorkflow(input: {
  taskId: string; userId: string; actionKind: string; actionHash: string; idempotencyKey: string;
  approvalId: string; payload: Record<string, unknown>;
}): Promise<{ started: boolean; workflowId?: string; runId?: string }> {
  const cfg = readTemporalConfig(process.env);
  if (!shouldUseTemporalForAction(cfg, input.actionKind)) return { started: false };
  const workflowId = `helm-ext-${input.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180)}`;

  if (process.env.HELM_TEMPORAL_TEST_MODE === "stub") {
    const existing = stubWorkflows.get(workflowId);
    if (existing) { existing.signals.push(`approve:${input.approvalId}`); return { started: true, workflowId, runId: existing.runId }; }
    const runId = `run_${workflowId}`;
    stubWorkflows.set(workflowId, { workflowId, runId, signals: [`approve:${input.approvalId}`], args: input });
    return { started: true, workflowId, runId };
  }

  const { client, cfg: c } = await getClient();
  const handle = await client.workflow.start("helmExternalActionWorkflow", {
    taskQueue: c.taskQueue,
    workflowId,
    args: [{ taskId: input.taskId, userId: input.userId, actionKind: input.actionKind, actionHash: input.actionHash, idempotencyKey: input.idempotencyKey, payload: input.payload }],
  });
  await handle.signal("approve", input.approvalId);
  return { started: true, workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
}
