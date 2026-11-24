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

export async function maybeStartReconciliationSchedule(): Promise<{ ok: boolean; scheduleId?: string; created?: boolean; reason?: string }> {
  const cfg = readTemporalConfig(process.env);
  if (!cfg.enabled) return { ok: false, reason: "temporal_disabled" };
  if (process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED !== "1") return { ok: false, reason: "schedule_disabled" };
  const scheduleId = cfg.reconciliationScheduleId;
  const intervalMs = Math.max(Number(process.env.HELM_RECONCILIATION_INTERVAL_MS ?? 60_000), 60_000);
  const olderThanMs = Math.max(Number(process.env.HELM_RECONCILIATION_OLDER_THAN_MS ?? 60_000), 0);
  const limit = Math.min(Math.max(Number(process.env.HELM_RECONCILIATION_LIMIT ?? 20), 1), 100);
  if (process.env.HELM_TEMPORAL_TEST_MODE === "stub") {
    const key = `schedule:${scheduleId}`;
    const exists = stubWorkflows.has(key);
    stubWorkflows.set(key, { workflowId: key, runId: exists ? stubWorkflows.get(key)!.runId : `run_${scheduleId}`, signals: [...(stubWorkflows.get(key)?.signals ?? []), exists ? "update" : "create"], args: { intervalMs, olderThanMs, limit } });
    return { ok: true, scheduleId, created: !exists };
  }
  const { client, cfg: c } = await getClient();
  const handle = client.schedule.getHandle(scheduleId);
  const spec = { intervals: [{ every: `${Math.floor(intervalMs / 1000)}s` }] };
  const action = { type: "startWorkflow", workflowType: "helmReconciliationWorkflow", taskQueue: c.taskQueue, args: [{ limit, olderThanMs }], workflowId: `${scheduleId}-run` };
  try {
    await handle.describe();
    await handle.update((prev: any) => ({ ...prev, spec, action: { ...prev.action, ...action } }));
    return { ok: true, scheduleId, created: false };
  } catch {
    await client.schedule.create({ scheduleId, spec, action, policies: { overlap: "SKIP", catchupWindow: "1m" }, state: { note: "Helm uncertain receipt reconciliation; lookup-first, no blind retry" } });
    return { ok: true, scheduleId, created: true };
  }
}

export async function getTemporalReconciliationScheduleStatus(): Promise<{ enabled: boolean; scheduleId: string; status?: string; reason?: string; nextActionTimes?: string[] }> {
  const cfg = readTemporalConfig(process.env);
  const scheduleId = cfg.reconciliationScheduleId;
  if (!cfg.enabled) return { enabled: false, scheduleId, reason: "temporal_disabled" };
  if (process.env.HELM_TEMPORAL_TEST_MODE === "stub") {
    const state = stubWorkflows.get(`schedule:${scheduleId}`);
    return { enabled: process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED === "1", scheduleId, status: state ? "active" : "missing", reason: state ? undefined : "not_created" };
  }
  try {
    const { client } = await getClient();
    const handle = client.schedule.getHandle(scheduleId);
    const desc = await handle.describe();
    return { enabled: true, scheduleId, status: desc.schedule?.state?.paused ? "paused" : "active", nextActionTimes: (desc.info?.nextActionTimes ?? []).map((d: Date) => d.toISOString?.() ?? String(d)) };
  } catch (e) {
    return { enabled: process.env.HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED === "1", scheduleId, status: "missing", reason: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}

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
