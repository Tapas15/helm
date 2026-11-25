import "dotenv/config";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { actionReceipts, approvals, auditLog, browserArtifacts, createDb, taskEvents, taskMessages, tasks } from "@helm/db";
import type { AgentRuntimeEvent } from "@helm/shared";
import { logger as log } from "./lib/logger.js";
import { HelmNativeRuntime } from "./runtime.js";

const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";
const { db, pool } = createDb(dbUrl);
const workerId = `worker_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const LEASE_MS = Number(process.env.WORKER_LEASE_MS ?? 30000);
const runtime = new HelmNativeRuntime();
const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;

async function nextSequence(taskId: string): Promise<number> {
  const rows = await db.select({ max: sql<number>`coalesce(max(${taskEvents.sequence}), -1)` }).from(taskEvents).where(eq(taskEvents.taskId, taskId));
  return Number(rows[0]?.max ?? -1) + 1;
}
async function insertEvent(taskId: string, userId: string, runId: string | null, type: string, correlationId: string, causationId: string | null, payload: Record<string, unknown>) {
  const sequence = await nextSequence(taskId);
  await db.insert(taskEvents).values({ id: uid("evt"), userId, taskId, runId, sequence, schemaVersion: 1, ts: new Date(), source: "worker", type, correlationId, causationId, payload });
}
async function recordBrowserArtifacts(task: typeof tasks.$inferSelect, runId: string, events: AgentRuntimeEvent[]) {
  for (const evt of events) {
    const artifact = (evt.payload as any)?.artifact;
    const sessionId = (evt.payload as any)?.sessionId ?? evt.trace?.sessionId;
    if (!artifact?.artifactId || !artifact?.path || !sessionId) continue;
    await db.insert(browserArtifacts).values({
      id: String(artifact.artifactId), userId: task.userId, taskId: task.id, runId, sessionId: String(sessionId),
      kind: String(artifact.kind ?? "unknown"), path: String(artifact.path), mime: String(artifact.mime ?? "application/octet-stream"),
      sha256: String(artifact.sha256 ?? ""), sizeBytes: Number(artifact.sizeBytes ?? 0), metadata: artifact.metadata ?? {}, createdAt: new Date(),
    }).onConflictDoNothing();
  }
}

async function claimNext() {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const [candidate] = await db.select().from(tasks).where(and(eq(tasks.status, "queued"), or(isNull(tasks.leaseUntil), lte(tasks.leaseUntil, now)))).orderBy(tasks.createdAt).limit(1);
  if (!candidate) return null;
  const [claimed] = await db.update(tasks).set({ status: "running", leaseOwner: workerId, leaseUntil, startedAt: candidate.startedAt ?? now, updatedAt: now }).where(and(eq(tasks.id, candidate.id), eq(tasks.status, "queued"), or(isNull(tasks.leaseOwner), eq(tasks.leaseOwner, workerId)))).returning();
  return claimed ?? null;
}

async function processTask(task: typeof tasks.$inferSelect) {
  const runId = uid("run");
  const correlationId = uid("corr");
  const trace = { taskId: task.id, runId, correlationId, userId: task.userId, agentId: workerId };
  const taskLog = log.child(trace);
  await insertEvent(task.id, task.userId, runId, "task.running", correlationId, task.id, { workerId, ...trace });
  taskLog.info({ event: "task.running" }, "task running");
  const runtimeEvents: AgentRuntimeEvent[] = [];
  let deltaBuf = "";
  let lastDeltaFlush = 0;
  try {
    const approvedRows = await db.select().from(approvals).where(and(eq(approvals.taskId, task.id), eq(approvals.status, "approved")));
    const approvedActionKinds = approvedRows.map((r) => r.actionKind);
    const approvedActionHashes = approvedRows.map((r) => r.actionHash);
    const approvalId = approvedRows[0]?.id ?? null;
    const approvedActionHash = approvedRows[0]?.actionHash ?? null;
    const recentMessages = await db.select({ role: taskMessages.role, content: taskMessages.content, createdAt: taskMessages.createdAt }).from(taskMessages).where(and(eq(taskMessages.taskId, task.id), eq(taskMessages.userId, task.userId))).orderBy(taskMessages.createdAt).limit(20);
    const thread = recentMessages.map((m) => ({ role: (m.role === "user" || m.role === "assistant" || m.role === "system" || m.role === "tool" ? m.role : "user") as "user"|"assistant"|"system"|"tool", content: m.content, ts: m.createdAt?.toISOString?.() ?? undefined }));
    let memoryFacts: string[] = [];
    if (process.env.HELM_MEMORY_ENABLED === "1") {
      try {
        const memRows = await db.select({ content: (await import("@helm/db")).memoryNotes.content, kind: (await import("@helm/db")).memoryNotes.kind, updatedAt: (await import("@helm/db")).memoryNotes.updatedAt }).from((await import("@helm/db")).memoryNotes).where(and(eq((await import("@helm/db")).memoryNotes.userId, task.userId))).orderBy((await import("@helm/db")).memoryNotes.updatedAt).limit(8);
        memoryFacts = memRows.map((r) => `[${r.kind}] ${String(r.content).slice(0, 300)}`).slice(-8);
        if (memoryFacts.length > 0) runtimeEvents.push({ type: "runtime.memory.loaded", ts: new Date().toISOString(), trace: { taskId: task.id, runId, correlationId, userId: task.userId, agentId: "helm-native" }, message: "Loaded memory notes", payload: { count: memoryFacts.length } });
      } catch (err) { taskLog.warn({ err }, "memory load failed"); }
    }
    for await (const evt of runtime.run({
      taskId: task.id, runId, userId: task.userId, prompt: task.prompt, kind: task.kind,
      model: typeof (task.state as any)?.modelOverride?.model === "string" ? String((task.state as any).modelOverride.model) : undefined,
      context: { ...((task.state as Record<string, unknown> | null) ?? {}), approvedActionKinds, approvalGranted: approvedActionKinds.length > 0, approvedActionHashes, approvalId, approvedActionHash, recentMessages, memoryFacts, persona: "You are Helm, a personal AI operator for the user's own tasks. Be precise, safe, and evidence-oriented." },
      thread,
      trace: { taskId: task.id, runId, correlationId, userId: task.userId, agentId: "helm-native" },
    })) {
      runtimeEvents.push(evt);
      const sessionId = (evt.payload as any)?.sessionId ?? evt.trace?.sessionId;
      if (sessionId) await db.update(tasks).set({ state: sql`jsonb_set(coalesce(${tasks.state}, '{}'::jsonb), '{activeBrowserSessionId}', ${JSON.stringify(String(sessionId))}::jsonb)`, updatedAt: new Date() }).where(eq(tasks.id, task.id));
      if (evt.type === "runtime.response.delta") {
        deltaBuf += String(evt.payload?.delta ?? "");
        const now = Date.now();
        if (now - lastDeltaFlush > 250 || deltaBuf.length > 120) {
          await insertEvent(task.id, task.userId, runId, evt.type, correlationId, task.id, { delta: deltaBuf, ts: evt.ts, trace: evt.trace, provider: evt.payload?.provider, model: evt.payload?.model });
          deltaBuf = ""; lastDeltaFlush = now;
        }
        continue;
      }
      if (deltaBuf) { await insertEvent(task.id, task.userId, runId, "runtime.response.delta", correlationId, task.id, { delta: deltaBuf, ts: evt.ts, trace: evt.trace }); deltaBuf = ""; }
      await insertEvent(task.id, task.userId, runId, evt.type, correlationId, task.id, { ...evt.payload, message: evt.message, ts: evt.ts, trace: evt.trace });
    }
    if (deltaBuf) await insertEvent(task.id, task.userId, runId, "runtime.response.delta", correlationId, task.id, { delta: deltaBuf, ts: new Date().toISOString(), trace });
    await recordBrowserArtifacts(task, runId, runtimeEvents);
    const result = HelmNativeRuntime.toResult(runtimeEvents);
    const approvalProposal = [...runtimeEvents].reverse().find((e) => e.type === "runtime.tool.proposed" && e.payload?.approvalRequired === true);
    if (result.status === "waiting_approval" && approvalProposal) {
      const actionHash = String(approvalProposal.payload.actionHash ?? uid("ah"));
      const actionKind = String(approvalProposal.payload.action ?? "external.high_risk");
      const summary = String(approvalProposal.message ?? "High-risk action requires approval");
      const [existing] = await db.select().from(approvals).where(and(eq(approvals.taskId, task.id), eq(approvals.actionHash, actionHash))).limit(1);
      const approval = existing ?? (await db.insert(approvals).values({ id: uid("apr"), userId: task.userId, taskId: task.id, runId, actionKind, actionHash, status: "pending", summary, evidence: { prompt: task.prompt, event: approvalProposal, trace }, requestedAt: new Date() }).returning())[0];
      if (!existing) {
        await db.insert(auditLog).values({ id: uid("aud"), userId: task.userId, ts: new Date(), actorType: "agent", actorId: "helm-native", taskId: task.id, action: "approval.requested", resourceType: "approval", resourceId: approval?.id ?? null, decision: "require_approval", reason: summary, metadata: { actionHash, actionKind, runId, correlationId } });
        await insertEvent(task.id, task.userId, runId, "runtime.approval.requested", correlationId, approval?.id ?? task.id, { approvalId: approval?.id, actionHash, actionKind, summary, ...trace });
      }
      await db.update(tasks).set({ status: "waiting_approval", leaseOwner: null, leaseUntil: null, updatedAt: new Date(), result: { status: "waiting_approval", approvalId: approval?.id, actionHash, summary } }).where(and(eq(tasks.id, task.id), eq(tasks.leaseOwner, workerId)));
      taskLog.info({ event: "approval.requested", approvalId: approval?.id }, "task waiting approval");
      return;
    }
    if (result.status === "waiting_input") {
      await db.update(tasks).set({ status: "waiting_input", leaseOwner: null, leaseUntil: null, updatedAt: new Date(), result: { status: "waiting_input", output: result.output } }).where(and(eq(tasks.id, task.id), eq(tasks.leaseOwner, workerId)));
      taskLog.info({ event: "task.waiting_input" }, "task waiting input/takeover");
      return;
    }
    if (approvedRows.length > 0) {
      for (const apr of approvedRows) {
        const idem = `task:${task.id}:action:${apr.actionHash}`;
        const [existingReceipt] = await db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, idem)).limit(1);
        if (existingReceipt?.status === "executed") continue;
        if (apr.actionKind.startsWith("browser.") || apr.actionKind.startsWith("external.")) {
          if (!existingReceipt) {
            await db.insert(actionReceipts).values({ id: uid("rcpt"), userId: task.userId, taskId: task.id, runId, approvalId: apr.id, actionKind: apr.actionKind, actionHash: apr.actionHash, idempotencyKey: idem, status: "approved", evidence: { runId, correlationId, note: "approved but not executed via guarded external-action path in this run" }, createdAt: new Date() }).onConflictDoNothing();
          }
          continue;
        }
        await db.insert(actionReceipts).values({ id: uid("rcpt"), userId: task.userId, taskId: task.id, runId, approvalId: apr.id, actionKind: apr.actionKind, actionHash: apr.actionHash, idempotencyKey: idem, status: "executed", evidence: { runId, correlationId, auto: true }, createdAt: new Date() }).onConflictDoNothing();
      }
    }
    const doneAt = new Date();
    const output = result.output ?? "Completed";
    await db.insert(taskMessages).values({ id: uid("msg"), userId: task.userId, taskId: task.id, role: "assistant", content: output, metadata: { runId, correlationId, status: result.status }, createdAt: doneAt }).catch(() => undefined);
    const [updated] = await db.update(tasks).set({
      status: result.status === "cancelled" ? "cancelled" : result.status === "failed" ? "failed" : "succeeded",
      leaseOwner: null, leaseUntil: null, updatedAt: doneAt, completedAt: doneAt,
      result: { ...result, runtime: "helm-native", events: runtimeEvents.length },
      errorCode: result.error?.code ?? null, errorMessage: result.error?.message ?? null,
    }).where(and(eq(tasks.id, task.id), eq(tasks.leaseOwner, workerId))).returning();
    if (updated) {
      await insertEvent(task.id, task.userId, runId, "task.completed", correlationId, task.id, { status: updated.status, output, ...trace });
      taskLog.info({ event: "task.completed", status: updated.status }, "task completed");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const doneAt = new Date();
    await db.insert(taskMessages).values({ id: uid("msg"), userId: task.userId, taskId: task.id, role: "assistant", content: `Error: ${message}`, metadata: { runId, correlationId, status: "failed" }, createdAt: doneAt }).catch(() => undefined);
    await db.update(tasks).set({ status: "failed", leaseOwner: null, leaseUntil: null, updatedAt: doneAt, completedAt: doneAt, errorCode: "RUNTIME_CRASH", errorMessage: message }).where(and(eq(tasks.id, task.id), eq(tasks.leaseOwner, workerId)));
    await insertEvent(task.id, task.userId, runId, "task.failed", correlationId, task.id, { code: "RUNTIME_CRASH", message, ...trace });
    taskLog.error({ err, event: "task.failed" }, "task failed");
  }
}

let running = true;
async function loop() { while (running) { try { const task = await claimNext(); if (task) await processTask(task); else await new Promise((r) => setTimeout(r, POLL_MS)); } catch (err) { log.error({ err, agentId: workerId }, "worker loop error"); await new Promise((r) => setTimeout(r, POLL_MS)); } } }
log.info({ workerId, pollMs: POLL_MS, leaseMs: LEASE_MS, runtime: runtime.provider }, "helm-worker started");
void loop();
const shutdown = async () => { running = false; log.info({ workerId }, "helm-worker shutting down"); await pool.end(); process.exit(0); };
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
