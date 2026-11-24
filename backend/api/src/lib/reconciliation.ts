import { and, eq, lt, sql } from "drizzle-orm";
import { actionReceipts, auditLog, taskEvents, type Database } from "@helm/db";
import { createLogger } from "@helm/observability";
import { DbCredentialBroker } from "./vault.js";
import { lookupGmailSend } from "../routes/gmail.js";
import { lookupCalendarCreate, lookupCalendarEventById } from "../routes/calendar.js";

const log = createLogger({ name: "helm-reconciliation" });
const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;

export type ReconcileResult = { scanned: number; reconciled: number; failed: number; skipped: number; errors: Array<{ receiptId: string; error: string }> };

async function nextSequence(db: Database, taskId: string): Promise<number> {
  const rows = await db.select({ max: sql<number>`coalesce(max(${taskEvents.sequence}), -1)` }).from(taskEvents).where(eq(taskEvents.taskId, taskId));
  return Number(rows[0]?.max ?? -1) + 1;
}

export async function reconcileUncertainReceipts(db: Database, opts?: { limit?: number; olderThanMs?: number; userId?: string }): Promise<ReconcileResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
  const olderThanMs = Math.max(opts?.olderThanMs ?? 60_000, 0);
  const cutoff = new Date(Date.now() - olderThanMs);
  const where = opts?.userId
    ? and(eq(actionReceipts.status, "uncertain"), lt(actionReceipts.createdAt, cutoff), eq(actionReceipts.userId, opts.userId))
    : and(eq(actionReceipts.status, "uncertain"), lt(actionReceipts.createdAt, cutoff));
  const rows = await db.select().from(actionReceipts).where(where).limit(limit);
  const vault = new DbCredentialBroker(db);
  const out: ReconcileResult = { scanned: rows.length, reconciled: 0, failed: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    try {
      let resolvedOutcome: "executed" | "failed" | null = null;
      let resolvedExternalRef: string | null = row.externalRef;
      let autoLookup: Record<string, unknown> | null = null;
      let lookupReason: string | null = null;
      if (row.actionKind === "gmail.send") {
        const lookup = await lookupGmailSend(db, vault, row.userId, { idempotencyKey: row.idempotencyKey, evidence: row.evidence });
        autoLookup = lookup as Record<string, unknown>;
        if (lookup.ok) { resolvedOutcome = "executed"; resolvedExternalRef = lookup.externalRef; }
        else lookupReason = lookup.reason ?? "not_found";
      } else if (row.actionKind === "calendar.create_event") {
        const lookup = await lookupCalendarCreate(db, vault, row.userId, { idempotencyKey: row.idempotencyKey, evidence: row.evidence });
        autoLookup = lookup as Record<string, unknown>;
        if (lookup.ok) { resolvedOutcome = "executed"; resolvedExternalRef = lookup.externalRef; }
        else lookupReason = lookup.reason ?? "not_found";
      } else if (row.actionKind === "calendar.update_event") {
        const lookup = await lookupCalendarEventById(db, vault, row.userId, { idempotencyKey: row.idempotencyKey, evidence: row.evidence }, true);
        autoLookup = lookup as Record<string, unknown>;
        if (lookup.ok) { resolvedOutcome = "executed"; resolvedExternalRef = lookup.externalRef; }
        else lookupReason = lookup.reason ?? "not_found";
      } else if (row.actionKind === "calendar.delete_event") {
        const lookup = await lookupCalendarEventById(db, vault, row.userId, { idempotencyKey: row.idempotencyKey, evidence: row.evidence }, false);
        autoLookup = lookup as Record<string, unknown>;
        if (lookup.ok) { resolvedOutcome = "executed"; resolvedExternalRef = lookup.externalRef; }
        else lookupReason = lookup.reason ?? "not_found";
      } else {
        out.skipped++;
        continue;
      }
      if (!resolvedOutcome) {
        // No blind retry: never re-execute external side effect. Only record lookup attempt; do not auto-fail by default.
        await db.update(actionReceipts).set({
          evidence: { ...(row.evidence as Record<string, unknown> ?? {}), lastReconcileAttemptAt: new Date().toISOString(), lastReconcileLookup: autoLookup, lastReconcileReason: lookupReason },
        }).where(and(eq(actionReceipts.id, row.id), eq(actionReceipts.status, "uncertain")));
        out.skipped++;
        continue;
      }
      const [updated] = await db.update(actionReceipts).set({
        status: resolvedOutcome,
        externalRef: resolvedExternalRef,
        evidence: { ...(row.evidence as Record<string, unknown> ?? {}), reconciled: true, reconciledAt: new Date().toISOString(), reconcileOutcome: resolvedOutcome, autoLookup, reconciledBy: "scheduler" },
      }).where(and(eq(actionReceipts.id, row.id), eq(actionReceipts.status, "uncertain"))).returning();
      if (!updated) { out.skipped++; continue; }
      await db.insert(auditLog).values({
        id: uid("aud"), userId: row.userId, ts: new Date(), actorType: "system", actorId: "reconciliation",
        taskId: row.taskId, action: "receipt.reconciled", resourceType: "action_receipt", resourceId: row.id,
        decision: "allow", reason: `auto_lookup_${resolvedOutcome}`, metadata: { actionKind: row.actionKind, idempotencyKey: row.idempotencyKey, externalRef: resolvedExternalRef, autoLookup },
      });
      if (row.taskId) {
        try {
          const seq = await nextSequence(db, row.taskId);
          await db.insert(taskEvents).values({
            id: uid("evt"), userId: row.userId, taskId: row.taskId, runId: row.runId, sequence: seq, schemaVersion: 1, ts: new Date(), source: "system",
            type: "receipt.reconciled", correlationId: row.taskId, causationId: row.id,
            payload: { receiptId: row.id, actionKind: row.actionKind, status: resolvedOutcome, externalRef: resolvedExternalRef, idempotencyKey: row.idempotencyKey },
          });
        } catch (e) { log.warn({ err: e, receiptId: row.id }, "reconciliation event insert failed"); }
      }
      out.reconciled++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.errors.push({ receiptId: row.id, error: msg.slice(0, 300) });
      out.failed++;
      log.warn({ err: e, receiptId: row.id, actionKind: row.actionKind }, "reconciliation failed");
    }
  }
  return out;
}
