import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { actionReceipts, approvals, auditLog, connectorAccounts, type Database } from "@helm/db";
import { GmailSendInput, HELM_ERROR_CODES, readTemporalConfig, shouldUseTemporalForAction } from "@helm/shared";
import { maybeStartExternalActionWorkflow } from "../lib/temporal.js";
import type { AppEnv } from "../types.js";
import { DbCredentialBroker } from "../lib/vault.js";
import { getValidGoogleAccessToken } from "./connector-accounts.js";
import { enforceIdentityPolicyForConnectorAccount } from "../lib/identity-policy.js";
import { emitFeedbackEvent } from "../lib/feedback.js";
import { redactSensitive } from "../lib/redaction.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });
const safeJson = <T>(v: T): T => redactSensitive(v) as T;

export async function lookupGmailSend(db: Database, vault: DbCredentialBroker, userId: string, receipt: { idempotencyKey: string; evidence: unknown }) {
  const evidence = (receipt.evidence ?? {}) as Record<string, unknown>;
  const accountId = typeof evidence.accountId === "string" ? evidence.accountId : null;
  const subject = typeof evidence.subject === "string" ? evidence.subject : null;
  const to = Array.isArray(evidence.to) ? evidence.to.map(String).filter(Boolean) : [];
  if (!accountId || !subject) return { ok: false as const, reason: "missing_reconcile_metadata" };
  const token = await getValidGoogleAccessToken(vault, userId, accountId);
  if (!token.token) return { ok: false as const, reason: token.reason ?? "missing_token" };

  const gmailBase = process.env.HELM_GMAIL_API_BASE ?? "https://gmail.googleapis.com";
  const q = `in:sent subject:${JSON.stringify(subject).slice(1, -1)} newer_than:7d`;
  const url = new URL(`${gmailBase}/gmail/v1/users/me/messages`);
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "10");
  const res = await fetch(url, { headers: { authorization: `Bearer ${token.token}` } });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false as const, reason: json?.error?.message ?? "gmail_lookup_failed" };
  const msgs = Array.isArray(json?.messages) ? json.messages as Array<{ id?: string; threadId?: string }> : [];
  const maxChecks = 10;
  for (const m of msgs.slice(0, maxChecks)) {
    if (!m?.id) continue;
    const detailRes = await fetch(`${gmailBase}/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=X-Helm-Idempotency&metadataHeaders=Subject&metadataHeaders=To`, { headers: { authorization: `Bearer ${token.token}` } });
    const detail = await detailRes.json().catch(() => null);
    if (!detailRes.ok) continue;
    const headers = Array.isArray(detail?.payload?.headers) ? detail.payload.headers as Array<{ name?: string; value?: string }> : [];
    const idem = headers.find((h) => String(h.name ?? "").toLowerCase() === "x-helm-idempotency")?.value;
    const hdrSubject = headers.find((h) => String(h.name ?? "").toLowerCase() === "subject")?.value ?? "";
    const hdrTo = headers.find((h) => String(h.name ?? "").toLowerCase() === "to")?.value ?? "";
    if (idem && idem === receipt.idempotencyKey) {
      return { ok: true as const, externalRef: String(m.id), threadId: detail?.threadId ? String(detail.threadId) : (m.threadId ? String(m.threadId) : null), matchedBy: "idempotency_header", checked: msgs.length };
    }
    // Weak fallback only when no idempotency header present.
    if (!idem && hdrSubject === subject && (to.length === 0 || to.some((t) => hdrTo.includes(t)))) {
      return { ok: true as const, externalRef: String(m.id), threadId: detail?.threadId ? String(detail.threadId) : (m.threadId ? String(m.threadId) : null), matchedBy: "subject_recipient_fallback", checked: msgs.length };
    }
  }
  return { ok: false as const, reason: "not_found", checked: Math.min(msgs.length, maxChecks) };
}

export function gmailRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const vault = new DbCredentialBroker(db);

  app.get("/accounts/:accountId/messages", async (c) => {
    const userId = c.get("userId");
    const accountId = c.req.param("accountId");
    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, accountId), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Connector account not found"), 404);
    if (account.connectorId !== "google-gmail" || account.status !== "active") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Gmail account not active"), 409);
    const token = await getValidGoogleAccessToken(vault, userId, accountId);
    if (!token.token) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, token.reason ?? "Gmail token not found"), 404);
    const q = c.req.query("q") ?? "";
    const maxResults = Math.min(Number(c.req.query("maxResults") ?? 10), 25);
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    if (q) url.searchParams.set("q", q);
    url.searchParams.set("maxResults", String(maxResults));
    const res = await fetch(url, { headers: { authorization: `Bearer ${token.token}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok) return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, json?.error?.message ?? "Gmail read failed", res.status >= 500), res.status as any);
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, action: "gmail.read", resourceType: "connector_account", resourceId: accountId, decision: "allow", reason: "read_first", metadata: { q, maxResults } });
    return c.json(safeJson({ ok: true, messages: json?.messages ?? [], nextPageToken: json?.nextPageToken ?? null }));
  });

  app.post("/send", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = GmailSendInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid Gmail send input", false, parsed.error.flatten()), 400);
    const input = parsed.data;
    const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.userId, userId))).limit(1);
    if (!approval) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Approval not found"), 404);
    if (approval.status !== "approved") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Approved approval required"), 403);
    if (approval.actionHash !== input.actionHash) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "actionHash mismatch"), 403);
    const [existing] = await db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.userId !== userId || existing.actionHash !== input.actionHash || existing.approvalId !== approval.id) {
        await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, taskId: approval.taskId, action: "gmail.send.idempotency_conflict", resourceType: "action_receipt", resourceId: existing.id, decision: "deny", reason: "idempotency_key_reused", metadata: { idempotencyKey: input.idempotencyKey } });
        return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key reused with different action/approval", false), 409);
      }
      if (existing.status === "executed") return c.json(safeJson({ ok: true, deduped: true, receiptId: existing.id, externalRef: existing.externalRef }));
      if (existing.status === "executing") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Send already executing", true), 409);
      if (existing.status === "uncertain") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Prior send outcome uncertain; reconcile before retry", true, { receiptId: existing.id }), 409);
    }
    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, input.accountId), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account || account.connectorId !== "google-gmail" || account.status !== "active") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Gmail account not active"), 409);
    const policy = await enforceIdentityPolicyForConnectorAccount(db, userId, input.accountId, "gmail.send", { recipients: input.to });
    if (!policy.ok) return c.json(err(policy.code, policy.message), policy.status);

    const temporalCfg = readTemporalConfig(process.env);
    const temporalSecret = process.env.HELM_TEMPORAL_ACTIVITY_SECRET;
    const temporalInternal = temporalSecret ? c.req.header("x-helm-temporal-activity-secret") === temporalSecret : c.req.header("x-helm-temporal-activity") === "1";
    if (!temporalInternal && shouldUseTemporalForAction(temporalCfg, "gmail.send")) {
      try {
        const started = await maybeStartExternalActionWorkflow({
          taskId: approval.taskId ?? input.accountId, userId, actionKind: "gmail.send", actionHash: input.actionHash, idempotencyKey: input.idempotencyKey,
          approvalId: approval.id, payload: { accountId: input.accountId, to: input.to, subject: input.subject, bodyText: input.bodyText },
        });
        if (started.started) {
          await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "api", actorId: "helm-api", taskId: approval.taskId, action: "gmail.send.temporal_started", resourceType: "connector_account", resourceId: input.accountId, decision: "allow", reason: "temporal_routed", metadata: { workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey } });
          return c.json(safeJson({ ok: true, routed: "temporal", workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey }), 202);
        }
      } catch (e) {
        return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, `Temporal routing failed: ${e instanceof Error ? e.message : String(e)}`, true), 503);
      }
    }

    const token = await getValidGoogleAccessToken(vault, userId, input.accountId);
    if (!token.token) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, token.reason ?? "Gmail token not found"), 404);

    const receiptId = uid("rcpt");
    await db.insert(actionReceipts).values({
      id: receiptId, userId, taskId: approval.taskId, runId: approval.runId, approvalId: approval.id, actionKind: "gmail.send",
      actionHash: input.actionHash, idempotencyKey: input.idempotencyKey, status: "executing",
      evidence: { to: input.to, subject: input.subject, accountId: input.accountId }
    }).onConflictDoNothing();

    const raw = Buffer.from(
      `To: ${input.to.join(", ")}\r\n` +
      `Subject: ${input.subject}\r\n` +
      `X-Helm-Idempotency: ${input.idempotencyKey}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      input.bodyText
    ).toString("base64url");
    const gmailBase = process.env.HELM_GMAIL_API_BASE ?? "https://gmail.googleapis.com";
    let res: Response;
    try {
      res = await fetch(`${gmailBase}/gmail/v1/users/me/messages/send`, {
        method: "POST",
        headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" },
        body: JSON.stringify({ raw }),
      });
    } catch (e) {
      await db.update(actionReceipts).set({ status: "uncertain", evidence: { error: e instanceof Error ? e.message : String(e), uncertain: true, accountId: input.accountId, to: input.to, subject: input.subject } }).where(eq(actionReceipts.id, receiptId));
      await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "system", actorId: "helm-api", taskId: approval.taskId, action: "gmail.send.uncertain", resourceType: "action_receipt", resourceId: receiptId, decision: "deny", reason: "network_error", metadata: { idempotencyKey: input.idempotencyKey } });
      await emitFeedbackEvent(db, { userId, taskId: approval.taskId, runId: approval.runId, kind: "tool_failure", signal: "negative", severity: "error", summary: "gmail.send.uncertain.network", payload: { actionKind: "gmail.send", receiptId, accountId: input.accountId, uncertain: true }, evidenceRefs: [{ type: "receipt", id: receiptId }] });
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, "Gmail send outcome uncertain due to network/error", true, { receiptId }), 503);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const uncertain = res.status >= 500 || res.status === 429;
      await db.update(actionReceipts).set({ status: uncertain ? "uncertain" : "failed", evidence: { error: json?.error?.message ?? "send_failed", status: res.status, uncertain, accountId: input.accountId, to: input.to, subject: input.subject } }).where(eq(actionReceipts.id, receiptId));
      await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "system", actorId: "helm-api", taskId: approval.taskId, action: uncertain ? "gmail.send.uncertain" : "gmail.send.failed", resourceType: "action_receipt", resourceId: receiptId, decision: "deny", reason: uncertain ? "provider_uncertain" : "provider_rejected", metadata: { idempotencyKey: input.idempotencyKey, status: res.status } });
      await emitFeedbackEvent(db, { userId, taskId: approval.taskId, runId: approval.runId, kind: "tool_failure", signal: "negative", severity: uncertain ? "error" : "warn", summary: uncertain ? "gmail.send.uncertain.provider" : "gmail.send.failed", payload: { actionKind: "gmail.send", receiptId, accountId: input.accountId, status: res.status, uncertain }, evidenceRefs: [{ type: "receipt", id: receiptId }] });
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, json?.error?.message ?? "Gmail send failed", uncertain, { receiptId }), res.status as any);
    }
    await db.update(actionReceipts).set({ status: "executed", externalRef: json?.id ?? null, evidence: { gmailMessageId: json?.id ?? null, threadId: json?.threadId ?? null, accountId: input.accountId, to: input.to, subject: input.subject } }).where(eq(actionReceipts.id, receiptId));
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, taskId: approval.taskId, action: "gmail.send", resourceType: "connector_account", resourceId: input.accountId, decision: "allow", reason: "approved", metadata: { approvalId: approval.id, idempotencyKey: input.idempotencyKey, gmailMessageId: json?.id ?? null } });
    return c.json(safeJson({ ok: true, receiptId, gmailMessageId: json?.id ?? null, threadId: json?.threadId ?? null }));
  });

  return app;
}
