import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { actionReceipts, approvals, auditLog, connectorAccounts, type Database } from "@helm/db";
import { GmailSendInput, HELM_ERROR_CODES } from "@helm/shared";
import type { AppEnv } from "../types.js";
import { DbCredentialBroker } from "../lib/vault.js";
import { getValidGoogleAccessToken } from "./connector-accounts.js";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

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
    return c.json({ ok: true, messages: json?.messages ?? [], nextPageToken: json?.nextPageToken ?? null });
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
      if (existing.status === "executed") return c.json({ ok: true, deduped: true, receiptId: existing.id, externalRef: existing.externalRef });
      if (existing.status === "executing") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Send already executing", true), 409);
      if (existing.status === "uncertain") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Prior send outcome uncertain; reconcile before retry", true, { receiptId: existing.id }), 409);
    }
    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, input.accountId), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account || account.connectorId !== "google-gmail" || account.status !== "active") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Gmail account not active"), 409);
    const token = await getValidGoogleAccessToken(vault, userId, input.accountId);
    if (!token.token) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, token.reason ?? "Gmail token not found"), 404);

    const receiptId = uid("rcpt");
    await db.insert(actionReceipts).values({
      id: receiptId, userId, taskId: approval.taskId, runId: approval.runId, approvalId: approval.id, actionKind: "gmail.send",
      actionHash: input.actionHash, idempotencyKey: input.idempotencyKey, status: "executing",
      evidence: { to: input.to, subject: input.subject, accountId: input.accountId }
    }).onConflictDoNothing();

    const raw = Buffer.from(`To: ${input.to.join(", ")}\r\nSubject: ${input.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.bodyText}`).toString("base64url");
    let res: Response;
    try {
      res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" },
        body: JSON.stringify({ raw }),
      });
    } catch (e) {
      await db.update(actionReceipts).set({ status: "uncertain", evidence: { error: e instanceof Error ? e.message : String(e), uncertain: true } }).where(eq(actionReceipts.id, receiptId));
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, "Gmail send outcome uncertain due to network/error", true, { receiptId }), 503);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const uncertain = res.status >= 500 || res.status === 429;
      await db.update(actionReceipts).set({ status: uncertain ? "uncertain" : "failed", evidence: { error: json?.error?.message ?? "send_failed", status: res.status, uncertain } }).where(eq(actionReceipts.id, receiptId));
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, json?.error?.message ?? "Gmail send failed", uncertain, { receiptId }), res.status as any);
    }
    await db.update(actionReceipts).set({ status: "executed", externalRef: json?.id ?? null, evidence: { gmailMessageId: json?.id ?? null, threadId: json?.threadId ?? null } }).where(eq(actionReceipts.id, receiptId));
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, taskId: approval.taskId, action: "gmail.send", resourceType: "connector_account", resourceId: input.accountId, decision: "allow", reason: "approved", metadata: { approvalId: approval.id, idempotencyKey: input.idempotencyKey, gmailMessageId: json?.id ?? null } });
    return c.json({ ok: true, receiptId, gmailMessageId: json?.id ?? null, threadId: json?.threadId ?? null });
  });

  return app;
}
