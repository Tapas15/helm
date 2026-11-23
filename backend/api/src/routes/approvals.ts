import { and, desc, eq } from "drizzle-orm";
import { approvals, auditLog, taskEvents, tasks, actionReceipts, type Database } from "@helm/db";
import { HELM_ERROR_CODES, ResolveApprovalInput } from "@helm/shared";
import { Hono } from "hono";
import type { AppEnv } from "../types.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
async function nextSequence(db: Database, taskId: string) { const rows = await db.select({ seq: taskEvents.sequence }).from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(desc(taskEvents.sequence)).limit(1); return Number(rows[0]?.seq ?? -1) + 1; }

export function approvalRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  app.get("/", async (c) => { const userId = c.get("userId"); const status = c.req.query("status"); const where = status ? and(eq(approvals.userId, userId), eq(approvals.status, status)) : eq(approvals.userId, userId); const rows = await db.select().from(approvals).where(where).orderBy(desc(approvals.requestedAt)).limit(100); return c.json({ approvals: rows }); });
  app.post("/:id/resolve", async (c) => {
    const userId = c.get("userId"); const requestId = c.get("requestId"); const correlationId = c.get("correlationId"); const id = c.req.param("id");
    const body = await c.req.json().catch(() => null); const parsed = ResolveApprovalInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid approval decision", false, parsed.error.flatten()), 400);
    const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, id), eq(approvals.userId, userId))).limit(1);
    if (!approval) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Approval not found"), 404);
    if (parsed.data.actionHash && parsed.data.actionHash !== approval.actionHash) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "actionHash does not match approval", false), 403);
    const desired = parsed.data.decision === "approve" ? "approved" : "rejected";
    if (approval.status !== "pending") {
      if (approval.status === desired) return c.json({ approval, deduped: true });
      return c.json(err(HELM_ERROR_CODES.INVALID_TRANSITION, `Approval already ${approval.status}`, false, { status: approval.status }), 409);
    }
    const ts = new Date();
    const [updated] = await db.update(approvals).set({ status: desired, decisionReason: parsed.data.reason ?? null, resolvedAt: ts }).where(and(eq(approvals.id, id), eq(approvals.status, "pending"))).returning();
    if (!updated) {
      const [current] = await db.select().from(approvals).where(and(eq(approvals.id, id), eq(approvals.userId, userId))).limit(1);
      if (current?.status === desired) return c.json({ approval: current, deduped: true });
      return c.json(err(HELM_ERROR_CODES.CONFLICT, "Approval state changed; retry", true, { status: current?.status }), 409);
    }
    if (desired === "approved") {
      await db.insert(actionReceipts).values({ id: uid("rcpt"), userId, taskId: approval.taskId, runId: approval.runId, approvalId: approval.id, actionKind: approval.actionKind, actionHash: approval.actionHash, idempotencyKey: parsed.data.idempotencyKey ?? `task:${approval.taskId}:action:${approval.actionHash}`, status: "approved", evidence: { requestId, correlationId, decision: desired }, createdAt: ts }).onConflictDoNothing();
    }
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, approval.taskId), eq(tasks.userId, userId))).limit(1);
    if (task) {
      const taskStatus = desired === "approved" ? "queued" : "cancelled";
      await db.update(tasks).set({ status: taskStatus, updatedAt: ts, completedAt: desired === "rejected" ? ts : task.completedAt, errorCode: desired === "rejected" ? "APPROVAL_REJECTED" : null, errorMessage: desired === "rejected" ? (parsed.data.reason ?? "User rejected approval") : null, leaseOwner: null, leaseUntil: null }).where(eq(tasks.id, task.id));
      const seq = await nextSequence(db, task.id);
      await db.insert(taskEvents).values({ id: uid("evt"), userId, taskId: task.id, runId: approval.runId, sequence: seq, schemaVersion: 1, ts, source: "api", type: desired === "approved" ? "approval.approved" : "approval.rejected", correlationId, causationId: approval.id, payload: { approvalId: approval.id, actionHash: approval.actionHash, decision: desired, reason: parsed.data.reason ?? null, requestId, correlationId } });
    }
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts, actorType: "user", actorId: userId, taskId: approval.taskId, action: `approval.${desired}`, resourceType: "approval", resourceId: approval.id, decision: desired === "approved" ? "allow" : "deny", reason: parsed.data.reason ?? null, metadata: { actionHash: approval.actionHash, actionKind: approval.actionKind, requestId, correlationId } });
    return c.json({ approval: updated });
  });
  return app;
}
