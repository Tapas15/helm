import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { actionReceipts, browserArtifacts, type Database } from "@helm/db";
import { HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { createReadStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { DbCredentialBroker } from "../lib/vault.js";
import { lookupGmailSend } from "./gmail.js";
import { lookupCalendarCreate, lookupCalendarEventById } from "./calendar.js";
import { redactSensitive } from "../lib/redaction.js";

const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

function artifactRoots() {
  const roots = [process.env.BROWSER_ARTIFACT_DIR, process.env.HELM_ARTIFACT_DIR, path.resolve(process.cwd(), ".data", "browser-artifacts")].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return [...new Set(roots.map((r) => path.resolve(r)))];
}

function isInside(root: string, candidate: string) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function redactEvidenceValue(value: unknown): unknown { return redactSensitive(value); }

function safeArtifact(r: typeof browserArtifacts.$inferSelect) {
  return { id: r.id, userId: r.userId, taskId: r.taskId, runId: r.runId, sessionId: r.sessionId, kind: r.kind, mime: r.mime, sha256: r.sha256, sizeBytes: r.sizeBytes, metadata: redactEvidenceValue(r.metadata ?? {}) as Record<string, unknown>, createdAt: r.createdAt };
}

function safeReceipt(r: typeof actionReceipts.$inferSelect) {
  return { id: r.id, userId: r.userId, taskId: r.taskId, runId: r.runId, approvalId: r.approvalId, actionKind: r.actionKind, actionHash: r.actionHash, idempotencyKey: r.idempotencyKey, status: r.status, externalRef: r.externalRef, evidence: redactEvidenceValue(r.evidence ?? {}) as Record<string, unknown>, createdAt: r.createdAt };
}

export function artifactRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  app.get("/", async (c) => {
    const userId = c.get("userId");
    const taskId = c.req.query("taskId");
    const where = taskId ? and(eq(browserArtifacts.userId, userId), eq(browserArtifacts.taskId, taskId)) : eq(browserArtifacts.userId, userId);
    const rows = await db.select().from(browserArtifacts).where(where).orderBy(desc(browserArtifacts.createdAt)).limit(100);
    return c.json({ artifacts: rows.map(safeArtifact) });
  });
  app.get("/:id", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(browserArtifacts).where(and(eq(browserArtifacts.id, id), eq(browserArtifacts.userId, userId))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Artifact not found"), 404);
    return c.json({ artifact: safeArtifact(row) });
  });
  app.get("/:id/download", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const [row] = await db.select().from(browserArtifacts).where(and(eq(browserArtifacts.id, id), eq(browserArtifacts.userId, userId))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Artifact not found"), 404);
    const resolved = path.resolve(row.path);
    const allowed = artifactRoots().some((root) => isInside(root, resolved));
    if (!allowed) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Artifact path is outside allowed artifact roots", false), 403);
    if (!existsSync(resolved)) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Artifact file missing"), 404);
    c.header("content-type", row.mime || "application/octet-stream");
    c.header("content-disposition", `inline; filename="${path.basename(resolved)}"`);
    return c.body(Readable.toWeb(createReadStream(resolved)) as any);
  });
  return app;
}

export function receiptRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  app.get("/", async (c) => {
    const userId = c.get("userId");
    const taskId = c.req.query("taskId");
    const status = c.req.query("status");
    const limitRaw = Number(c.req.query("limit") ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 200) : 100;
    const where = taskId ? and(eq(actionReceipts.userId, userId), eq(actionReceipts.taskId, taskId)) : eq(actionReceipts.userId, userId);
    const rows = await db.select().from(actionReceipts).where(where).orderBy(desc(actionReceipts.createdAt)).limit(status ? 200 : limit);
    const filtered = (status ? rows.filter((r) => r.status === status) : rows).slice(0, limit);
    return c.json({ receipts: filtered.map(safeReceipt), limit });
  });

  app.post("/:id/reconcile", async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const outcome = body?.outcome;
    const externalRef = typeof body?.externalRef === "string" ? body.externalRef : null;
    const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
    if (outcome !== "executed" && outcome !== "failed") return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "outcome must be executed or failed"), 400);
    const [row] = await db.select().from(actionReceipts).where(and(eq(actionReceipts.id, id), eq(actionReceipts.userId, userId))).limit(1);
    if (!row) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Receipt not found"), 404);
    if (row.status !== "uncertain") return c.json(err(HELM_ERROR_CODES.CONFLICT, `Receipt is ${row.status}; only uncertain receipts can be reconciled`), 409);

    let resolvedOutcome = outcome;
    let resolvedExternalRef = externalRef ?? row.externalRef;
    let autoLookup: Record<string, unknown> | null = null;
    if (row.actionKind === "gmail.send") {
      const vault = new DbCredentialBroker(db);
      const lookup = await lookupGmailSend(db, vault, userId, { idempotencyKey: row.idempotencyKey, evidence: row.evidence });
      autoLookup = lookup as Record<string, unknown>;
      if (lookup.ok) { resolvedOutcome = "executed"; resolvedExternalRef = lookup.externalRef; }
    } else if (row.actionKind === "calendar.create_event") {
      const vault = new DbCredentialBroker(db);
      const lookup = await lookupCalendarCreate(db, vault, userId, { idempotencyKey: row.idempotencyKey, evidence: row.evidence });
      autoLookup = lookup as Record<string, unknown>;
      if (lookup.ok) { resolvedOutcome = "executed"; resolvedExternalRef = lookup.externalRef; }
    } else if (row.actionKind === "calendar.update_event") {
      const vault = new DbCredentialBroker(db);
      const lookup = await lookupCalendarEventById(db, vault, userId, { idempotencyKey: row.idempotencyKey, evidence: row.evidence }, true);
      autoLookup = lookup as Record<string, unknown>;
      if (lookup.ok) { resolvedOutcome = "executed"; resolvedExternalRef = lookup.externalRef; }
    } else if (row.actionKind === "calendar.delete_event") {
      const vault = new DbCredentialBroker(db);
      const lookup = await lookupCalendarEventById(db, vault, userId, { idempotencyKey: row.idempotencyKey, evidence: row.evidence }, false);
      autoLookup = lookup as Record<string, unknown>;
      if (lookup.ok) { resolvedOutcome = "executed"; resolvedExternalRef = lookup.externalRef; }
    }

    const [updated] = await db.update(actionReceipts).set({
      status: resolvedOutcome,
      externalRef: resolvedExternalRef,
      evidence: { ...(row.evidence as Record<string, unknown> ?? {}), reconciled: true, reconciledAt: new Date().toISOString(), reconcileNote: note, reconcileOutcome: resolvedOutcome, autoLookup },
    }).where(and(eq(actionReceipts.id, id), eq(actionReceipts.status, "uncertain"))).returning();
    if (!updated) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Receipt changed during reconciliation", true), 409);
    return c.json({ ok: true, receipt: safeReceipt(updated), autoLookup: redactEvidenceValue(autoLookup) as Record<string, unknown> | null });
  });

  return app;
}


