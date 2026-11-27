import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { actionReceipts, approvals, auditLog, connectorAccounts, type Database } from "@helm/db";
import { CalendarCreateEventInput, CalendarDeleteEventInput, CalendarUpdateEventInput, HELM_ERROR_CODES, readTemporalConfig, shouldUseTemporalForAction } from "@helm/shared";
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

export async function lookupCalendarCreate(db: Database, vault: DbCredentialBroker, userId: string, receipt: { idempotencyKey: string; evidence: unknown }) {
  const evidence = (receipt.evidence ?? {}) as Record<string, unknown>;
  const accountId = typeof evidence.accountId === "string" ? evidence.accountId : null;
  const summary = typeof evidence.summary === "string" ? evidence.summary : null;
  const startIso = typeof evidence.startIso === "string" ? evidence.startIso : null;
  const endIso = typeof evidence.endIso === "string" ? evidence.endIso : null;
  if (!accountId || !summary || !startIso || !endIso) return { ok: false as const, reason: "missing_reconcile_metadata" };
  const token = await getValidGoogleAccessToken(vault, userId, accountId);
  if (!token.token) return { ok: false as const, reason: token.reason ?? "missing_token" };
  const calendarBase = process.env.HELM_CALENDAR_API_BASE ?? "https://www.googleapis.com";
  const url = new URL(`${calendarBase}/calendar/v3/calendars/primary/events`);
  url.searchParams.set("q", summary);
  url.searchParams.set("timeMin", new Date(Date.parse(startIso) - 5 * 60_000).toISOString());
  url.searchParams.set("timeMax", new Date(Date.parse(endIso) + 24 * 60 * 60_000).toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "10");
  const res = await fetch(url, { headers: { authorization: `Bearer ${token.token}` } });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false as const, reason: json?.error?.message ?? "calendar_lookup_failed" };
  const items = Array.isArray(json?.items) ? json.items as Array<Record<string, any>> : [];
  const match = items.slice(0, 10).find((i) => String(i?.summary ?? "") === summary && String(i?.start?.dateTime ?? i?.start?.date ?? "") === startIso);
  if (!match?.id) return { ok: false as const, reason: "not_found", checked: Math.min(items.length, 10) };
  return { ok: true as const, externalRef: String(match.id), htmlLink: match.htmlLink ? String(match.htmlLink) : null, matchedBy: "summary_start_fallback", checked: Math.min(items.length, 10) };
}

export async function lookupCalendarEventById(db: Database, vault: DbCredentialBroker, userId: string, receipt: { idempotencyKey: string; evidence: unknown }, expectedPresent: boolean) {
  const evidence = (receipt.evidence ?? {}) as Record<string, unknown>;
  const accountId = typeof evidence.accountId === "string" ? evidence.accountId : null;
  const calendarId = typeof evidence.calendarId === "string" ? evidence.calendarId : "primary";
  const eventId = typeof evidence.eventId === "string" ? evidence.eventId : (typeof evidence.externalRef === "string" ? evidence.externalRef : null);
  if (!accountId || !eventId) return { ok: false as const, reason: "missing_reconcile_metadata" };
  const token = await getValidGoogleAccessToken(vault, userId, accountId);
  if (!token.token) return { ok: false as const, reason: token.reason ?? "missing_token" };
  const calendarBase = process.env.HELM_CALENDAR_API_BASE ?? "https://www.googleapis.com";
  const url = `${calendarBase}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token.token}` } });
  const json = await res.json().catch(() => null);
  if (expectedPresent) {
    if (res.status === 404) return { ok: false as const, reason: "not_found" };
    if (!res.ok) return { ok: false as const, reason: json?.error?.message ?? "calendar_lookup_failed" };
    return { ok: true as const, externalRef: String(json?.id ?? eventId), htmlLink: json?.htmlLink ? String(json.htmlLink) : null, matchedBy: "event_id_lookup" };
  }
  if (res.status === 404 || res.status === 410) return { ok: true as const, externalRef: String(eventId), matchedBy: "event_absent" };
  if (!res.ok) return { ok: false as const, reason: json?.error?.message ?? "calendar_lookup_failed" };
  // Event still present - uncertain delete should not be marked executed.
  return { ok: false as const, reason: "event_still_present" };
}

export function calendarRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  const vault = new DbCredentialBroker(db);

  app.get("/accounts/:accountId/events", async (c) => {
    const userId = c.get("userId");
    const accountId = c.req.param("accountId");
    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, accountId), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Connector account not found"), 404);
    if (account.connectorId !== "google-calendar" || account.status !== "active") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Calendar account not active"), 409);
    const token = await getValidGoogleAccessToken(vault, userId, accountId);
    if (!token.token) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, token.reason ?? "Calendar token not found"), 404);
    const maxResults = Math.min(Number(c.req.query("maxResults") ?? 10), 25);
    const timeMin = c.req.query("timeMin") ?? new Date().toISOString();
    const calendarBase = process.env.HELM_CALENDAR_API_BASE ?? "https://www.googleapis.com";
  const url = new URL(`${calendarBase}/calendar/v3/calendars/primary/events`);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token.token}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok) return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, json?.error?.message ?? "Calendar read failed", res.status >= 500), res.status as any);
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, action: "calendar.read", resourceType: "connector_account", resourceId: accountId, decision: "allow", reason: "read_first", metadata: { maxResults, timeMin } });
    return c.json(safeJson({ ok: true, events: json?.items ?? [], nextPageToken: json?.nextPageToken ?? null }));
  });

  app.post("/events/create", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = CalendarCreateEventInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid calendar create input", false, parsed.error.flatten()), 400);
    const input = parsed.data;
    const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.userId, userId))).limit(1);
    if (!approval) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Approval not found"), 404);
    if (approval.status !== "approved") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Approved approval required"), 403);
    if (approval.actionHash !== input.actionHash) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "actionHash mismatch"), 403);

    const [existing] = await db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.userId !== userId || existing.actionHash !== input.actionHash || existing.approvalId !== approval.id) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key reused with different action/approval", false), 409);
      if (existing.status === "executed") return c.json(safeJson({ ok: true, deduped: true, receiptId: existing.id, externalRef: existing.externalRef }));
      if (existing.status === "executing") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Create already executing", true), 409);
      if (existing.status === "uncertain") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Prior create outcome uncertain; reconcile before retry", true, { receiptId: existing.id }), 409);
    }

    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, input.accountId), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account || account.connectorId !== "google-calendar" || account.status !== "active") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Calendar account not active"), 409);
    const policy = await enforceIdentityPolicyForConnectorAccount(db, userId, input.accountId, "calendar.external_write", { recipients: input.attendees });
    if (!policy.ok) return c.json(err(policy.code, policy.message), policy.status);

    const temporalCfg = readTemporalConfig(process.env);
    const temporalSecret = process.env.HELM_TEMPORAL_ACTIVITY_SECRET;
    const temporalInternal = temporalSecret ? c.req.header("x-helm-temporal-activity-secret") === temporalSecret : c.req.header("x-helm-temporal-activity") === "1";
    if (!temporalInternal && shouldUseTemporalForAction(temporalCfg, "calendar.create_event")) {
      try {
        const started = await maybeStartExternalActionWorkflow({
          taskId: approval.taskId ?? input.accountId, userId, actionKind: "calendar.create_event", actionHash: input.actionHash, idempotencyKey: input.idempotencyKey,
          approvalId: approval.id, payload: { accountId: input.accountId, calendarId: input.calendarId, summary: input.summary, description: input.description, startIso: input.startIso, endIso: input.endIso, timeZone: input.timeZone, attendees: input.attendees },
        });
        if (started.started) {
          await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "api", actorId: "helm-api", taskId: approval.taskId, action: "calendar.create_event.temporal_started", resourceType: "connector_account", resourceId: input.accountId, decision: "allow", reason: "temporal_routed", metadata: { workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey } });
          return c.json(safeJson({ ok: true, routed: "temporal", workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey }), 202);
        }
      } catch (e) {
        return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, `Temporal routing failed: ${e instanceof Error ? e.message : String(e)}`, true), 503);
      }
    }

    const token = await getValidGoogleAccessToken(vault, userId, input.accountId);
    if (!token.token) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, token.reason ?? "Calendar token not found"), 404);

    const receiptId = uid("rcpt");
    await db.insert(actionReceipts).values({
      id: receiptId, userId, taskId: approval.taskId, runId: approval.runId, approvalId: approval.id, actionKind: "calendar.create_event",
      actionHash: input.actionHash, idempotencyKey: input.idempotencyKey, status: "executing",
      evidence: { accountId: input.accountId, calendarId: input.calendarId, summary: input.summary, startIso: input.startIso, endIso: input.endIso, attendees: input.attendees }
    }).onConflictDoNothing();
    const [inserted] = await db.select({ id: actionReceipts.id, userId: actionReceipts.userId, actionHash: actionReceipts.actionHash, approvalId: actionReceipts.approvalId, status: actionReceipts.status, externalRef: actionReceipts.externalRef }).from(actionReceipts).where(eq(actionReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    if (!inserted) return c.json(err(HELM_ERROR_CODES.INTERNAL_ERROR, "Failed to create action receipt", true), 500);
    if (inserted.id !== receiptId) {
      if (inserted.userId !== userId || inserted.actionHash !== input.actionHash || inserted.approvalId !== approval.id) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key reused with different action/approval", false), 409);
      if (inserted.status === "executed") return c.json(safeJson({ ok: true, deduped: true, receiptId: inserted.id, externalRef: inserted.externalRef }));
      if (inserted.status === "executing") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Create already executing", true), 409);
      if (inserted.status === "uncertain") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Prior create outcome uncertain; reconcile before retry", true, { receiptId: inserted.id }), 409);
      return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key conflict; reconcile before retry", true, { receiptId: inserted.id }), 409);
    }

    const eventBody = {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.startIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) },
      end: { dateTime: input.endIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) },
      attendees: input.attendees.map((email) => ({ email })),
    };

    let res: Response;
    try {
      res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`, {
        method: "POST",
        headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", "x-helm-idempotency": input.idempotencyKey },
        body: JSON.stringify(eventBody),
      });
    } catch (e) {
      await db.update(actionReceipts).set({ status: "uncertain", evidence: { accountId: input.accountId, calendarId: input.calendarId, summary: input.summary, startIso: input.startIso, endIso: input.endIso, error: e instanceof Error ? e.message : String(e), uncertain: true } }).where(eq(actionReceipts.id, receiptId));
      await emitFeedbackEvent(db, { userId, taskId: approval.taskId, runId: approval.runId, kind: "tool_failure", signal: "negative", severity: "error", summary: "calendar.create.uncertain.network", payload: { actionKind: "calendar.create_event", receiptId, accountId: input.accountId, uncertain: true }, evidenceRefs: [{ type: "receipt", id: receiptId }] });
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, "Calendar create outcome uncertain due to network/error", true, { receiptId }), 503);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const uncertain = res.status >= 500 || res.status === 429;
      await db.update(actionReceipts).set({ status: uncertain ? "uncertain" : "failed", evidence: { accountId: input.accountId, calendarId: input.calendarId, summary: input.summary, startIso: input.startIso, endIso: input.endIso, error: json?.error?.message ?? "calendar_create_failed", status: res.status, uncertain } }).where(eq(actionReceipts.id, receiptId));
      await emitFeedbackEvent(db, { userId, taskId: approval.taskId, runId: approval.runId, kind: "tool_failure", signal: "negative", severity: uncertain ? "error" : "warn", summary: uncertain ? "calendar.create.uncertain.provider" : "calendar.create.failed", payload: { actionKind: "calendar.create_event", receiptId, accountId: input.accountId, status: res.status, uncertain }, evidenceRefs: [{ type: "receipt", id: receiptId }] });
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, json?.error?.message ?? "Calendar create failed", uncertain, { receiptId }), res.status as any);
    }
    await db.update(actionReceipts).set({ status: "executed", externalRef: json?.id ?? null, evidence: { accountId: input.accountId, calendarId: input.calendarId, summary: input.summary, startIso: input.startIso, endIso: input.endIso, calendarEventId: json?.id ?? null, htmlLink: json?.htmlLink ?? null, status: json?.status ?? null } }).where(eq(actionReceipts.id, receiptId));
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, taskId: approval.taskId, action: "calendar.create_event", resourceType: "connector_account", resourceId: input.accountId, decision: "allow", reason: "approved", metadata: { approvalId: approval.id, idempotencyKey: input.idempotencyKey, calendarEventId: json?.id ?? null } });
    return c.json(safeJson({ ok: true, receiptId, calendarEventId: json?.id ?? null, htmlLink: json?.htmlLink ?? null }));
  });

  app.post("/events/update", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = CalendarUpdateEventInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid calendar update input", false, parsed.error.flatten()), 400);
    const input = parsed.data;
    if (!input.summary && !input.description && !input.startIso && !input.endIso && !input.timeZone && !input.attendees) {
      return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Calendar update requires at least one field"), 400);
    }
    if ((input.startIso && !input.endIso) || (!input.startIso && input.endIso)) {
      return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "startIso and endIso must be provided together"), 400);
    }
    const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.userId, userId))).limit(1);
    if (!approval) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Approval not found"), 404);
    if (approval.status !== "approved") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Approved approval required"), 403);
    if (approval.actionHash !== input.actionHash) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "actionHash mismatch"), 403);

    const [existing] = await db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.userId !== userId || existing.actionHash !== input.actionHash || existing.approvalId !== approval.id) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key reused with different action/approval", false), 409);
      if (existing.status === "executed") return c.json(safeJson({ ok: true, deduped: true, receiptId: existing.id, externalRef: existing.externalRef }));
      if (existing.status === "executing") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Update already executing", true), 409);
      if (existing.status === "uncertain") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Prior update outcome uncertain; reconcile before retry", true, { receiptId: existing.id }), 409);
    }

    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, input.accountId), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account || account.connectorId !== "google-calendar" || account.status !== "active") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Calendar account not active"), 409);
    const policy = await enforceIdentityPolicyForConnectorAccount(db, userId, input.accountId, "calendar.external_write", { recipients: input.attendees ?? [] });
    if (!policy.ok) return c.json(err(policy.code, policy.message), policy.status);

    const temporalCfg = readTemporalConfig(process.env);
    const temporalSecret = process.env.HELM_TEMPORAL_ACTIVITY_SECRET;
    const temporalInternal = temporalSecret ? c.req.header("x-helm-temporal-activity-secret") === temporalSecret : c.req.header("x-helm-temporal-activity") === "1";
    if (!temporalInternal && shouldUseTemporalForAction(temporalCfg, "calendar.update_event")) {
      try {
        const started = await maybeStartExternalActionWorkflow({
          taskId: approval.taskId ?? input.accountId, userId, actionKind: "calendar.update_event", actionHash: input.actionHash, idempotencyKey: input.idempotencyKey,
          approvalId: approval.id, payload: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId, summary: input.summary, description: input.description, startIso: input.startIso, endIso: input.endIso, timeZone: input.timeZone, attendees: input.attendees },
        });
        if (started.started) {
          await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "api", actorId: "helm-api", taskId: approval.taskId, action: "calendar.update_event.temporal_started", resourceType: "connector_account", resourceId: input.accountId, decision: "allow", reason: "temporal_routed", metadata: { workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey } });
          return c.json(safeJson({ ok: true, routed: "temporal", workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey }), 202);
        }
      } catch (e) {
        return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, `Temporal routing failed: ${e instanceof Error ? e.message : String(e)}`, true), 503);
      }
    }

    const token = await getValidGoogleAccessToken(vault, userId, input.accountId);
    if (!token.token) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, token.reason ?? "Calendar token not found"), 404);

    const receiptId = uid("rcpt");
    await db.insert(actionReceipts).values({
      id: receiptId, userId, taskId: approval.taskId, runId: approval.runId, approvalId: approval.id, actionKind: "calendar.update_event",
      actionHash: input.actionHash, idempotencyKey: input.idempotencyKey, status: "executing",
      evidence: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId, summary: input.summary ?? null, startIso: input.startIso ?? null, endIso: input.endIso ?? null }
    }).onConflictDoNothing();
    const [inserted] = await db.select({ id: actionReceipts.id, userId: actionReceipts.userId, actionHash: actionReceipts.actionHash, approvalId: actionReceipts.approvalId, status: actionReceipts.status, externalRef: actionReceipts.externalRef }).from(actionReceipts).where(eq(actionReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    if (!inserted) return c.json(err(HELM_ERROR_CODES.INTERNAL_ERROR, "Failed to create action receipt", true), 500);
    if (inserted.id !== receiptId) {
      if (inserted.userId !== userId || inserted.actionHash !== input.actionHash || inserted.approvalId !== approval.id) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key reused with different action/approval", false), 409);
      if (inserted.status === "executed") return c.json(safeJson({ ok: true, deduped: true, receiptId: inserted.id, externalRef: inserted.externalRef }));
      if (inserted.status === "executing") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Update already executing", true), 409);
      if (inserted.status === "uncertain") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Prior update outcome uncertain; reconcile before retry", true, { receiptId: inserted.id }), 409);
      return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key conflict; reconcile before retry", true, { receiptId: inserted.id }), 409);
    }

    const eventBody: Record<string, unknown> = {};
    if (input.summary !== undefined) eventBody.summary = input.summary;
    if (input.description !== undefined) eventBody.description = input.description;
    if (input.startIso) eventBody.start = { dateTime: input.startIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) };
    if (input.endIso) eventBody.end = { dateTime: input.endIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) };
    if (input.attendees) eventBody.attendees = input.attendees.map((email) => ({ email }));

    let res: Response;
    try {
      res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", "x-helm-idempotency": input.idempotencyKey },
        body: JSON.stringify(eventBody),
      });
    } catch (e) {
      await db.update(actionReceipts).set({ status: "uncertain", evidence: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId, error: e instanceof Error ? e.message : String(e), uncertain: true } }).where(eq(actionReceipts.id, receiptId));
      await emitFeedbackEvent(db, { userId, taskId: approval.taskId, runId: approval.runId, kind: "tool_failure", signal: "negative", severity: "error", summary: "calendar.update.uncertain.network", payload: { actionKind: "calendar.update_event", receiptId, accountId: input.accountId, eventId: input.eventId, uncertain: true }, evidenceRefs: [{ type: "receipt", id: receiptId }] });
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, "Calendar update outcome uncertain due to network/error", true, { receiptId }), 503);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const uncertain = res.status >= 500 || res.status === 429;
      await db.update(actionReceipts).set({ status: uncertain ? "uncertain" : "failed", evidence: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId, error: json?.error?.message ?? "calendar_update_failed", status: res.status, uncertain } }).where(eq(actionReceipts.id, receiptId));
      await emitFeedbackEvent(db, { userId, taskId: approval.taskId, runId: approval.runId, kind: "tool_failure", signal: "negative", severity: uncertain ? "error" : "warn", summary: uncertain ? "calendar.update.uncertain.provider" : "calendar.update.failed", payload: { actionKind: "calendar.update_event", receiptId, accountId: input.accountId, eventId: input.eventId, status: res.status, uncertain }, evidenceRefs: [{ type: "receipt", id: receiptId }] });
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, json?.error?.message ?? "Calendar update failed", uncertain, { receiptId }), res.status as any);
    }
    await db.update(actionReceipts).set({ status: "executed", externalRef: json?.id ?? input.eventId, evidence: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId, calendarEventId: json?.id ?? input.eventId, htmlLink: json?.htmlLink ?? null, status: json?.status ?? null } }).where(eq(actionReceipts.id, receiptId));
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, taskId: approval.taskId, action: "calendar.update_event", resourceType: "connector_account", resourceId: input.accountId, decision: "allow", reason: "approved", metadata: { approvalId: approval.id, idempotencyKey: input.idempotencyKey, eventId: input.eventId, calendarEventId: json?.id ?? input.eventId } });
    return c.json(safeJson({ ok: true, receiptId, calendarEventId: json?.id ?? input.eventId, htmlLink: json?.htmlLink ?? null }));
  });

  app.post("/events/delete", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = CalendarDeleteEventInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid calendar delete input", false, parsed.error.flatten()), 400);
    const input = parsed.data;
    const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.userId, userId))).limit(1);
    if (!approval) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Approval not found"), 404);
    if (approval.status !== "approved") return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Approved approval required"), 403);
    if (approval.actionHash !== input.actionHash) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "actionHash mismatch"), 403);

    const [existing] = await db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      if (existing.userId !== userId || existing.actionHash !== input.actionHash || existing.approvalId !== approval.id) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key reused with different action/approval", false), 409);
      if (existing.status === "executed") return c.json(safeJson({ ok: true, deduped: true, receiptId: existing.id, externalRef: existing.externalRef }));
      if (existing.status === "executing") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Delete already executing", true), 409);
      if (existing.status === "uncertain") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Prior delete outcome uncertain; reconcile before retry", true, { receiptId: existing.id }), 409);
    }

    const [account] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, input.accountId), eq(connectorAccounts.userId, userId))).limit(1);
    if (!account || account.connectorId !== "google-calendar" || account.status !== "active") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Calendar account not active"), 409);
    const policy = await enforceIdentityPolicyForConnectorAccount(db, userId, input.accountId, "calendar.external_write");
    if (!policy.ok) return c.json(err(policy.code, policy.message), policy.status);

    const temporalCfg = readTemporalConfig(process.env);
    const temporalSecret = process.env.HELM_TEMPORAL_ACTIVITY_SECRET;
    const temporalInternal = temporalSecret ? c.req.header("x-helm-temporal-activity-secret") === temporalSecret : c.req.header("x-helm-temporal-activity") === "1";
    if (!temporalInternal && shouldUseTemporalForAction(temporalCfg, "calendar.delete_event")) {
      try {
        const started = await maybeStartExternalActionWorkflow({
          taskId: approval.taskId ?? input.accountId, userId, actionKind: "calendar.delete_event", actionHash: input.actionHash, idempotencyKey: input.idempotencyKey,
          approvalId: approval.id, payload: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId },
        });
        if (started.started) {
          await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "api", actorId: "helm-api", taskId: approval.taskId, action: "calendar.delete_event.temporal_started", resourceType: "connector_account", resourceId: input.accountId, decision: "allow", reason: "temporal_routed", metadata: { workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey } });
          return c.json(safeJson({ ok: true, routed: "temporal", workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey }), 202);
        }
      } catch (e) {
        return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, `Temporal routing failed: ${e instanceof Error ? e.message : String(e)}`, true), 503);
      }
    }

    const token = await getValidGoogleAccessToken(vault, userId, input.accountId);
    if (!token.token) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, token.reason ?? "Calendar token not found"), 404);

    const receiptId = uid("rcpt");
    await db.insert(actionReceipts).values({
      id: receiptId, userId, taskId: approval.taskId, runId: approval.runId, approvalId: approval.id, actionKind: "calendar.delete_event",
      actionHash: input.actionHash, idempotencyKey: input.idempotencyKey, status: "executing",
      evidence: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId }
    }).onConflictDoNothing();
    const [inserted] = await db.select({ id: actionReceipts.id, userId: actionReceipts.userId, actionHash: actionReceipts.actionHash, approvalId: actionReceipts.approvalId, status: actionReceipts.status, externalRef: actionReceipts.externalRef }).from(actionReceipts).where(eq(actionReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    if (!inserted) return c.json(err(HELM_ERROR_CODES.INTERNAL_ERROR, "Failed to create action receipt", true), 500);
    if (inserted.id !== receiptId) {
      if (inserted.userId !== userId || inserted.actionHash !== input.actionHash || inserted.approvalId !== approval.id) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key reused with different action/approval", false), 409);
      if (inserted.status === "executed") return c.json(safeJson({ ok: true, deduped: true, receiptId: inserted.id, externalRef: inserted.externalRef }));
      if (inserted.status === "executing") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Delete already executing", true), 409);
      if (inserted.status === "uncertain") return c.json(err(HELM_ERROR_CODES.CONFLICT, "Prior delete outcome uncertain; reconcile before retry", true, { receiptId: inserted.id }), 409);
      return c.json(err(HELM_ERROR_CODES.CONFLICT, "Idempotency key conflict; reconcile before retry", true, { receiptId: inserted.id }), 409);
    }

    let res: Response;
    try {
      res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token.token}`, "x-helm-idempotency": input.idempotencyKey },
      });
    } catch (e) {
      await db.update(actionReceipts).set({ status: "uncertain", evidence: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId, error: e instanceof Error ? e.message : String(e), uncertain: true } }).where(eq(actionReceipts.id, receiptId));
      await emitFeedbackEvent(db, { userId, taskId: approval.taskId, runId: approval.runId, kind: "tool_failure", signal: "negative", severity: "error", summary: "calendar.delete.uncertain.network", payload: { actionKind: "calendar.delete_event", receiptId, accountId: input.accountId, eventId: input.eventId, uncertain: true }, evidenceRefs: [{ type: "receipt", id: receiptId }] });
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, "Calendar delete outcome uncertain due to network/error", true, { receiptId }), 503);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const uncertain = res.status >= 500 || res.status === 429;
      await db.update(actionReceipts).set({ status: uncertain ? "uncertain" : "failed", evidence: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId, error: json?.error?.message ?? "calendar_delete_failed", status: res.status, uncertain } }).where(eq(actionReceipts.id, receiptId));
      await emitFeedbackEvent(db, { userId, taskId: approval.taskId, runId: approval.runId, kind: "tool_failure", signal: "negative", severity: uncertain ? "error" : "warn", summary: uncertain ? "calendar.delete.uncertain.provider" : "calendar.delete.failed", payload: { actionKind: "calendar.delete_event", receiptId, accountId: input.accountId, eventId: input.eventId, status: res.status, uncertain }, evidenceRefs: [{ type: "receipt", id: receiptId }] });
      return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, json?.error?.message ?? "Calendar delete failed", uncertain, { receiptId }), res.status as any);
    }
    await db.update(actionReceipts).set({ status: "executed", externalRef: input.eventId, evidence: { accountId: input.accountId, calendarId: input.calendarId, eventId: input.eventId, deleted: true } }).where(eq(actionReceipts.id, receiptId));
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, taskId: approval.taskId, action: "calendar.delete_event", resourceType: "connector_account", resourceId: input.accountId, decision: "allow", reason: "approved", metadata: { approvalId: approval.id, idempotencyKey: input.idempotencyKey, eventId: input.eventId } });
    return c.json(safeJson({ ok: true, receiptId, eventId: input.eventId, deleted: true }));
  });

  return app;
}
