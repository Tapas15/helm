import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { actionReceipts, approvals, auditLog, browserArtifacts, taskEvents, tasks, type Database } from "@helm/db";
import { BrowserActionGuard, BrowserClickInput, BrowserExternalActionInput, BrowserFillInput, BrowserNavigateInput, BrowserResumeInput, BrowserScreenshotInput, BrowserTakeoverInput, CreateBrowserSessionInput, HELM_ERROR_CODES, readTemporalConfig, shouldUseTemporalForAction } from "@helm/shared";
import { maybeStartExternalActionWorkflow } from "../lib/temporal.js";
import type { AppEnv } from "../types.js";

import { createBrowserAdapter } from "../lib/browser-adapter.js";

const browserAdapter = createBrowserAdapter(process.env);
const browserAdapterEnabled = process.env.HELM_BROWSER_ADAPTER_DISPATCH === "1";
const browserUrl = process.env.BROWSER_WORKER_URL ?? "http://127.0.0.1:8790";
const browserToken = process.env.BROWSER_WORKER_TOKEN ?? "dev-browser-token";
const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
const err = (code: string, message: string, retryable = false, details?: unknown) => ({ error: { code, message, retryable, ...(details !== undefined ? { details } : {}) } });

async function proxy(path: string, init?: RequestInit) {
  if (browserAdapterEnabled) return browserAdapter.request(path, init);
  const res = await fetch(`${browserUrl}${path}`, { ...init, headers: { authorization: `Bearer ${browserToken}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  return { status: res.status, contentType: res.headers.get("content-type") ?? "application/json", text: await res.text() };
}
async function nextSequence(db: Database, taskId: string) {
  const rows = await db.select({ sequence: taskEvents.sequence }).from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(taskEvents.sequence);
  return (rows[rows.length - 1]?.sequence ?? -1) + 1;
}
async function emitTaskEvent(db: Database, args: { userId: string; taskId: string; runId?: string | null; type: string; source: string; correlationId?: string | null; causationId?: string | null; payload: Record<string, unknown> }) {
  const seq = await nextSequence(db, args.taskId);
  await db.insert(taskEvents).values({ id: uid("evt"), userId: args.userId, taskId: args.taskId, runId: args.runId ?? null, sequence: seq, schemaVersion: 1, ts: new Date(), source: args.source, type: args.type, correlationId: args.correlationId ?? null, causationId: args.causationId ?? null, payload: args.payload });
}
async function getBrowserSession(sessionId: string) {
  const res = await fetch(`${browserUrl}/v1/sessions/${sessionId}`, { headers: { authorization: `Bearer ${browserToken}` } });
  if (!res.ok) return null;
  return (await res.json().catch(() => null))?.session ?? null;
}
async function resolveTaskForSession(db: Database, userId: string, sessionId: string) {
  const session = await getBrowserSession(sessionId);
  const sessionTaskId = session?.taskId;
  if (sessionTaskId) {
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, sessionTaskId), eq(tasks.userId, userId))).limit(1);
    if (task) return { task, session, binding: "session.taskId" as const };
  }
  const candidates = await db.select().from(tasks).where(and(eq(tasks.userId, userId))).orderBy(tasks.updatedAt);
  const task = candidates.reverse().find((t: any) => String((t.state as any)?.activeBrowserSessionId ?? "") === sessionId) ?? null;
  return task ? { task, session, binding: "task.state.activeBrowserSessionId" as const } : { task: null, session, binding: "unbound" as const };
}
async function requireOwnedSession(db: Database, userId: string, sessionId: string) {
  const { task, session, binding } = await resolveTaskForSession(db, userId, sessionId);
  if (!session) return { ok: false as const, status: 404, body: err(HELM_ERROR_CODES.NOT_FOUND, "Browser session not found") };
  if (!task) return { ok: false as const, status: 403, body: err(HELM_ERROR_CODES.FORBIDDEN, "Browser session is not bound to an owned task; rebind required", false, { sessionId, policy: "legacy-unbound-session-hard-block" }) };
  return { ok: true as const, task, session, binding };
}
async function requireApprovedAction(db: Database, userId: string, guard: { approvalId: string; actionHash: string; idempotencyKey: string }) {
  const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, guard.approvalId), eq(approvals.userId, userId))).limit(1);
  if (!approval) return { ok: false as const, status: 404, body: err(HELM_ERROR_CODES.NOT_FOUND, "Approval not found") };
  if (approval.status !== "approved") return { ok: false as const, status: 403, body: err(HELM_ERROR_CODES.FORBIDDEN, `Approval is ${approval.status}; approved approval required`, false) };
  if (approval.actionHash !== guard.actionHash) return { ok: false as const, status: 403, body: err(HELM_ERROR_CODES.FORBIDDEN, "actionHash does not match approved action", false) };
  const [receipt] = await db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, guard.idempotencyKey)).limit(1);
  if (receipt) {
    if (receipt.actionHash !== guard.actionHash || receipt.approvalId !== guard.approvalId) return { ok: false as const, status: 409, body: err(HELM_ERROR_CODES.CONFLICT, "Idempotency key reused with different action/approval", false) };
    if (receipt.status === "executed") return { ok: false as const, status: 200, body: { ok: true, deduped: true, receiptId: receipt.id, idempotencyKey: receipt.idempotencyKey } };
    if (receipt.status === "executing") return { ok: false as const, status: 409, body: err(HELM_ERROR_CODES.CONFLICT, "Action already executing", true) };
  }
  return { ok: true as const, approval, receipt };
}

export function browserRoutes(db: Database) {
  const app = new Hono<AppEnv>();
  app.get("/sessions", async (c) => {
    const userId = c.get("userId");
    const r = await proxy("/v1/sessions");
    const json = JSON.parse(r.text || "{}");
    if (r.status >= 400 || !Array.isArray(json?.sessions)) return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
    const owned = await db.select({ id: tasks.id, state: tasks.state }).from(tasks).where(eq(tasks.userId, userId));
    const ownedTaskIds = new Set(owned.map(t => t.id));
    const ownedSessionIds = new Set(owned.map(t => String((t.state as any)?.activeBrowserSessionId ?? "")).filter(Boolean));
    const sessions = json.sessions.filter((s: any) => (s?.taskId && ownedTaskIds.has(String(s.taskId))) || ownedSessionIds.has(String(s?.id ?? "")));
    return c.json({ sessions });
  });
  app.post("/sessions", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = CreateBrowserSessionInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid session input", false, parsed.error.flatten()), 400);
    const userId = c.get("userId");
    if (parsed.data.taskId) {
      const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, parsed.data.taskId), eq(tasks.userId, userId))).limit(1);
      if (!task) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Task not found for browser session"), 404);
    }
    const r = await proxy("/v1/sessions", { method: "POST", body: JSON.stringify(parsed.data) });
    const json = JSON.parse(r.text || "{}");
    if (r.status < 400 && json?.session?.id) {
      const sessionId = String(json.session.id);
      if (parsed.data.taskId) {
        await db.update(tasks).set({ updatedAt: new Date(), state: { ...(await db.select({ state: tasks.state }).from(tasks).where(and(eq(tasks.id, parsed.data.taskId), eq(tasks.userId, userId))).limit(1).then(r=> (r[0]?.state as Record<string,unknown> ?? {}))), activeBrowserSessionId: sessionId } }).where(and(eq(tasks.id, parsed.data.taskId), eq(tasks.userId, userId)));
      }
      await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, taskId: parsed.data.taskId ?? null, action: "browser.session.created", resourceType: "browser_session", resourceId: sessionId, decision: "allow", reason: "user_requested", metadata: { requestId: c.get("requestId"), correlationId: c.get("correlationId") } });
    }
    return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
  });
  app.get("/sessions/:id", async (c) => {
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const r = await proxy(`/v1/sessions/${c.req.param("id")}`);
    return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
  });
  app.get("/sessions/:id/screenshot.png", async (c) => {
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const res = await fetch(`${browserUrl}/v1/sessions/${c.req.param("id")}/screenshot.png`, { headers: { authorization: `Bearer ${browserToken}` } });
    const bytes = await res.arrayBuffer();
    return c.newResponse(bytes, res.status as any, { "content-type": res.headers.get("content-type") ?? "image/png", "cache-control": "no-store" });
  });
  app.get("/sessions/:id/stream/status", async (c) => {
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const r = await proxy(`/v1/sessions/${c.req.param("id")}/stream/status`);
    if (r.status < 400) await db.insert(auditLog).values({ id: uid("aud"), userId: c.get("userId"), ts: new Date(), actorType: "user", actorId: c.get("userId"), taskId: owned.task.id, action: "browser.stream.status", resourceType: "browser_session", resourceId: c.req.param("id"), decision: "allow", reason: "observe", metadata: { requestId: c.get("requestId"), correlationId: c.get("correlationId") } });
    return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
  });

  app.get("/adapter/status", (c) => c.json({ ok: true, adapter: browserAdapter.kind, dispatchEnabled: browserAdapterEnabled }));

  async function act(c: any, schema: any, path: string) { const body = await c.req.json().catch(() => ({})); const parsed = schema.safeParse(body); if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid action input", false, parsed.error.flatten()), 400); const r = await proxy(path, { method: "POST", body: JSON.stringify(parsed.data) }); return c.newResponse(r.text, r.status as any, { "content-type": r.contentType }); }
  async function guardedAct(c: any, schema: any, action: string, path: string) {
    const body = await c.req.json().catch(() => ({}));
    const base = schema.safeParse(body);
    const guard = BrowserActionGuard.safeParse(body);
    if (!base.success || !guard.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid action input; approvalId/actionHash/idempotencyKey required", false, { action: base.error?.flatten(), guard: guard.error?.flatten() }), 400);
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const auth = await requireApprovedAction(db, c.get("userId"), guard.data);
    if (!auth.ok) return c.json(auth.body as any, auth.status as any);
    const approval = auth.approval;
    if (owned.task.id !== approval.taskId) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Approval task does not match browser session task", false), 403);
    if (!auth.receipt) {
      await db.insert(actionReceipts).values({ id: uid("rcpt"), userId: c.get("userId"), taskId: approval.taskId, runId: approval.runId, approvalId: approval.id, actionKind: `browser.${action}`, actionHash: approval.actionHash, idempotencyKey: guard.data.idempotencyKey, status: "executing", evidence: { requestId: c.get("requestId"), correlationId: c.get("correlationId"), sessionId: c.req.param("id"), action }, createdAt: new Date() }).onConflictDoNothing();
    } else {
      await db.update(actionReceipts).set({ status: "executing" }).where(eq(actionReceipts.id, auth.receipt.id));
    }
    const [claimed] = await db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, guard.data.idempotencyKey)).limit(1);
    if (!claimed) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Failed to claim idempotency receipt", true), 409);
    if (claimed.status === "executed") return c.json({ ok: true, deduped: true, receiptId: claimed.id, idempotencyKey: claimed.idempotencyKey });
    const r = await proxy(path, { method: "POST", body: JSON.stringify(base.data) });
    const json = JSON.parse(r.text || "{}");
    if (r.status >= 400 || !json?.ok) {
      await db.update(actionReceipts).set({ status: "failed", evidence: { ...(claimed.evidence as any ?? {}), error: json?.error ?? r.text } }).where(eq(actionReceipts.id, claimed.id));
      return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
    }
    await db.update(actionReceipts).set({ status: "executed", evidence: { ...(claimed.evidence as any ?? {}), result: json?.data ?? {} } }).where(eq(actionReceipts.id, claimed.id));
    await emitTaskEvent(db, { userId: c.get("userId"), taskId: approval.taskId, runId: approval.runId, type: `browser.${action}.executed`, source: "api", correlationId: c.get("correlationId"), causationId: approval.id, payload: { sessionId: c.req.param("id"), approvalId: approval.id, actionHash: guard.data.actionHash, idempotencyKey: guard.data.idempotencyKey, action } });
    await db.insert(auditLog).values({ id: uid("aud"), userId: c.get("userId"), ts: new Date(), actorType: "user", actorId: c.get("userId"), taskId: approval.taskId, action: `browser.${action}.executed`, resourceType: "action_receipt", resourceId: claimed.id, decision: "allow", reason: "approved guarded browser action", metadata: { actionHash: guard.data.actionHash, idempotencyKey: guard.data.idempotencyKey } });
    return c.json({ ...json, data: { ...(json.data ?? {}), receiptId: claimed.id, idempotencyKey: guard.data.idempotencyKey } });
  }

  // Read/observe actions proxied (low-risk). Side-effecting actions require approval+hash+idempotency.
  app.post("/sessions/:id/navigate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const guard = BrowserActionGuard.safeParse(body);
    if (guard.success) return guardedAct(c, BrowserNavigateInput, "navigate", `/v1/sessions/${c.req.param("id")}/navigate`);
    const parsed = BrowserNavigateInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid action input", false, parsed.error.flatten()), 400);
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const url = String(parsed.data.url);
    const allowed = /^https?:\/\/(localhost|127\.0\.0\.1|example\.com|www\.example\.com)(\/|$)/i.test(url);
    if (!allowed) return c.json(err(HELM_ERROR_CODES.FORBIDDEN, "Navigation to non-allowlisted domain requires approvalId/actionHash/idempotencyKey", false, { url }), 403);
    await db.insert(auditLog).values({ id: uid("aud"), userId: c.get("userId"), ts: new Date(), actorType: "user", actorId: c.get("userId"), taskId: owned.task.id, action: "browser.navigate.low_risk", resourceType: "browser_session", resourceId: c.req.param("id"), decision: "allow", reason: "allowlisted low-risk navigation", metadata: { url, requestId: c.get("requestId"), correlationId: c.get("correlationId") } });
    const r = await proxy(`/v1/sessions/${c.req.param("id")}/navigate`, { method: "POST", body: JSON.stringify(parsed.data) });
    return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
  });
  app.post("/sessions/:id/click", (c) => guardedAct(c, BrowserClickInput, "click", `/v1/sessions/${c.req.param("id")}/click`));
  app.post("/sessions/:id/fill", (c) => guardedAct(c, BrowserFillInput, "fill", `/v1/sessions/${c.req.param("id")}/fill`));
  app.post("/sessions/:id/screenshot", async (c) => {
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const body = await c.req.json().catch(() => ({}));
    const parsed = BrowserScreenshotInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid screenshot input", false, parsed.error.flatten()), 400);
    const r = await proxy(`/v1/sessions/${c.req.param("id")}/screenshot`, { method: "POST", body: JSON.stringify(parsed.data) });
    await db.insert(auditLog).values({ id: uid("aud"), userId: c.get("userId"), ts: new Date(), actorType: "user", actorId: c.get("userId"), taskId: owned.task.id, action: "browser.screenshot", resourceType: "browser_session", resourceId: c.req.param("id"), decision: r.status < 400 ? "allow" : "deny", reason: r.status < 400 ? "observe" : "proxy_error", metadata: { requestId: c.get("requestId"), correlationId: c.get("correlationId") } });
    return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
  });
  app.post("/sessions/:id/snapshot", async (c) => {
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const r = await proxy(`/v1/sessions/${c.req.param("id")}/snapshot`, { method: "POST", body: "{}" });
    await db.insert(auditLog).values({ id: uid("aud"), userId: c.get("userId"), ts: new Date(), actorType: "user", actorId: c.get("userId"), taskId: owned.task.id, action: "browser.snapshot", resourceType: "browser_session", resourceId: c.req.param("id"), decision: r.status < 400 ? "allow" : "deny", reason: r.status < 400 ? "observe" : "proxy_error", metadata: { requestId: c.get("requestId"), correlationId: c.get("correlationId") } });
    return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
  });

  app.post("/sessions/:id/takeover/request", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = BrowserTakeoverInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid takeover input", false, parsed.error.flatten()), 400);
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const r = await proxy(`/v1/sessions/${c.req.param("id")}/takeover/request`, { method: "POST", body: JSON.stringify(parsed.data) });
    const json = JSON.parse(r.text || "{}");
    if (r.status < 400 && json?.ok) {
      const sessionId = c.req.param("id");
      const task = owned.task;
      const current = ((task.state as any)?.takeover ?? {});
      if (current.active !== true) {
        await db.update(tasks).set({ status: "waiting_input", updatedAt: new Date(), state: { ...((task.state as Record<string, unknown>) ?? {}), activeBrowserSessionId: sessionId, takeover: { active: true, reason: parsed.data.reason, requestedAt: new Date().toISOString() } } }).where(eq(tasks.id, task.id));
        await emitTaskEvent(db, { userId: c.get("userId"), taskId: task.id, runId: (task as any).currentStepId ?? null, type: "browser.takeover.requested", source: "api", correlationId: c.get("correlationId"), causationId: c.get("requestId"), payload: { sessionId, reason: parsed.data.reason, control: json.data?.control ?? null } });
        await db.insert(auditLog).values({ id: uid("aud"), userId: c.get("userId"), ts: new Date(), actorType: "user", actorId: c.get("userId"), taskId: task.id, action: "browser.takeover.requested", resourceType: "browser_session", resourceId: sessionId, decision: "allow", reason: parsed.data.reason, metadata: { correlationId: c.get("correlationId"), requestId: c.get("requestId") } });
      }
    }
    return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
  });

  app.post("/sessions/:id/takeover/resume", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = BrowserResumeInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid resume input", false, parsed.error.flatten()), 400);
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const r = await proxy(`/v1/sessions/${c.req.param("id")}/takeover/resume`, { method: "POST", body: JSON.stringify(parsed.data) });
    const json = JSON.parse(r.text || "{}");
    if (r.status < 400 && json?.ok) {
      const sessionId = c.req.param("id");
      const task = owned.task;
      const current = ((task.state as any)?.takeover ?? {});
      if (current.active !== false || task.status !== "queued") {
        await db.update(tasks).set({ status: "queued", updatedAt: new Date(), leaseOwner: null, leaseUntil: null, state: { ...((task.state as Record<string, unknown>) ?? {}), activeBrowserSessionId: sessionId, takeover: { ...current, active: false, resumedAt: new Date().toISOString(), note: parsed.data.note ?? null } } }).where(eq(tasks.id, task.id));
        await emitTaskEvent(db, { userId: c.get("userId"), taskId: task.id, runId: (task as any).currentStepId ?? null, type: "browser.takeover.resumed", source: "api", correlationId: c.get("correlationId"), causationId: c.get("requestId"), payload: { sessionId, note: parsed.data.note ?? null, control: json.data?.control ?? null } });
        await db.insert(auditLog).values({ id: uid("aud"), userId: c.get("userId"), ts: new Date(), actorType: "user", actorId: c.get("userId"), taskId: task.id, action: "browser.takeover.resumed", resourceType: "browser_session", resourceId: sessionId, decision: "allow", reason: parsed.data.note ?? "resumed", metadata: { correlationId: c.get("correlationId"), requestId: c.get("requestId") } });
      }
    }
    return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
  });

  app.post("/sessions/:id/external-action", async (c) => {
    const userId = c.get("userId"); const requestId = c.get("requestId"); const correlationId = c.get("correlationId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = BrowserExternalActionInput.safeParse(body);
    if (!parsed.success) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "Invalid external action input", false, parsed.error.flatten()), 400);
    const input = parsed.data;
    const auth = await requireApprovedAction(db, userId, input);
    if (!auth.ok) return c.json(auth.body as any, auth.status as any);
    const approval = auth.approval;

    const temporalCfg = readTemporalConfig(process.env);
    const temporalSecret = process.env.HELM_TEMPORAL_ACTIVITY_SECRET;
    const temporalInternal = temporalSecret ? c.req.header("x-helm-temporal-activity-secret") === temporalSecret : c.req.header("x-helm-temporal-activity") === "1";
    if (!temporalInternal && shouldUseTemporalForAction(temporalCfg, "browser.external_action")) {
      try {
        const started = await maybeStartExternalActionWorkflow({
          taskId: approval.taskId, userId, actionKind: "browser.external_action", actionHash: input.actionHash, idempotencyKey: input.idempotencyKey,
          approvalId: approval.id, payload: { sessionId: c.req.param("id"), action: input.action, params: (input as any).params ?? {} },
        });
        if (started.started) {
          await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "api", actorId: "helm-api", taskId: approval.taskId, action: "browser.external_action.temporal_started", resourceType: "browser_session", resourceId: c.req.param("id"), decision: "allow", reason: "temporal_routed", metadata: { workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey } });
          return c.json({ ok: true, routed: "temporal", workflowId: started.workflowId, runId: started.runId, idempotencyKey: input.idempotencyKey }, 202);
        }
      } catch (e) {
        return c.json(err(HELM_ERROR_CODES.DEPENDENCY_ERROR, `Temporal routing failed: ${e instanceof Error ? e.message : String(e)}`, true), 503);
      }
    }

    if (!auth.receipt) {
      const ts = new Date();
      await db.insert(actionReceipts).values({ id: uid("rcpt"), userId, taskId: approval.taskId, runId: approval.runId, approvalId: approval.id, actionKind: approval.actionKind, actionHash: approval.actionHash, idempotencyKey: input.idempotencyKey, status: "executing", evidence: { requestId, correlationId, sessionId: c.req.param("id"), action: input.action }, createdAt: ts }).onConflictDoNothing();
    } else {
      await db.update(actionReceipts).set({ status: "executing", evidence: { ...(auth.receipt.evidence as any ?? {}), requestId, correlationId, sessionId: c.req.param("id"), action: input.action } }).where(eq(actionReceipts.id, auth.receipt.id));
    }
    const [claimed] = await db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, input.idempotencyKey)).limit(1);
    if (!claimed) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Failed to claim idempotency receipt", true), 409);
    if (claimed.status === "executed") return c.json({ ok: true, sessionId: c.req.param("id"), action: `external.${input.action}`, data: { deduped: true, receiptId: claimed.id, idempotencyKey: claimed.idempotencyKey } });
    const r = await proxy(`/v1/sessions/${c.req.param("id")}/external-action`, { method: "POST", body: JSON.stringify(input) });
    const json = JSON.parse(r.text || "{}");
    if (r.status >= 400 || !json?.ok) {
      await db.update(actionReceipts).set({ status: "failed", evidence: { ...(claimed.evidence as any ?? {}), error: json?.error ?? r.text } }).where(eq(actionReceipts.id, claimed.id));
      return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
    }
    const artifact = json?.data?.artifact;
    if (artifact?.artifactId) {
      await db.insert(browserArtifacts).values({ id: String(artifact.artifactId), userId, taskId: approval.taskId, runId: approval.runId, sessionId: c.req.param("id"), kind: String(artifact.kind ?? "external_action_evidence"), path: String(artifact.path), mime: String(artifact.mime ?? "image/png"), sha256: String(artifact.sha256 ?? ""), sizeBytes: Number(artifact.sizeBytes ?? 0), metadata: artifact.metadata ?? {}, createdAt: new Date() }).onConflictDoNothing();
    }
    await db.update(actionReceipts).set({ status: "executed", evidence: { ...(claimed.evidence as any ?? {}), result: json?.data ?? {}, artifactId: artifact?.artifactId ?? null } }).where(eq(actionReceipts.id, claimed.id));
    await emitTaskEvent(db, { userId, taskId: approval.taskId, runId: approval.runId, type: "browser.external_action.executed", source: "api", correlationId, causationId: approval.id, payload: { sessionId: c.req.param("id"), approvalId: approval.id, actionHash: input.actionHash, idempotencyKey: input.idempotencyKey, action: input.action, artifact } });
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts: new Date(), actorType: "user", actorId: userId, taskId: approval.taskId, action: "browser.external_action.executed", resourceType: "action_receipt", resourceId: claimed.id, decision: "allow", reason: "approved action executed with idempotency receipt", metadata: { actionHash: input.actionHash, idempotencyKey: input.idempotencyKey, requestId, correlationId } });
    return c.json({ ...json, data: { ...(json.data ?? {}), receiptId: claimed.id } });
  });

  app.post("/sessions/:id/rebind", async (c) => {
    const userId = c.get("userId");
    const sessionId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const taskId = typeof (body as any)?.taskId === "string" ? String((body as any).taskId) : "";
    if (!taskId) return c.json(err(HELM_ERROR_CODES.VALIDATION_ERROR, "taskId required", false), 400);
    const session = await getBrowserSession(sessionId);
    if (!session) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Browser session not found"), 404);
    if (session.taskId && session.taskId !== taskId) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Browser session already bound to a different task", false, { sessionTaskId: session.taskId }), 409);
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
    if (!task) return c.json(err(HELM_ERROR_CODES.NOT_FOUND, "Task not found"), 404);
    const existing = String((task.state as any)?.activeBrowserSessionId ?? "");
    if (existing && existing !== sessionId) return c.json(err(HELM_ERROR_CODES.CONFLICT, "Task already has an active browser session", false, { activeBrowserSessionId: existing }), 409);
    const ts = new Date();
    await db.update(tasks).set({ updatedAt: ts, state: { ...((task.state as Record<string, unknown>) ?? {}), activeBrowserSessionId: sessionId } }).where(and(eq(tasks.id, task.id), eq(tasks.userId, userId)));
    await emitTaskEvent(db, { userId, taskId: task.id, runId: null, type: "browser.session.rebound", source: "api", correlationId: c.get("correlationId"), causationId: c.get("requestId"), payload: { sessionId, previousTaskId: session.taskId ?? null, policy: "explicit-rebind-owned-task" } });
    await db.insert(auditLog).values({ id: uid("aud"), userId, ts, actorType: "user", actorId: userId, taskId: task.id, action: "browser.session.rebound", resourceType: "browser_session", resourceId: sessionId, decision: "allow", reason: "explicit user rebind", metadata: { requestId: c.get("requestId"), correlationId: c.get("correlationId"), previousTaskId: session.taskId ?? null } });
    return c.json({ ok: true, sessionId, taskId: task.id, rebound: true });
  });

  app.post("/sessions/:id/close", async (c) => {
    const owned = await requireOwnedSession(db, c.get("userId"), c.req.param("id"));
    if (!owned.ok) return c.json(owned.body as any, owned.status as any);
    const r = await proxy(`/v1/sessions/${c.req.param("id")}/close`, { method: "POST", body: "{}" });
    await db.insert(auditLog).values({ id: uid("aud"), userId: c.get("userId"), ts: new Date(), actorType: "user", actorId: c.get("userId"), taskId: owned.task.id, action: "browser.close", resourceType: "browser_session", resourceId: c.req.param("id"), decision: r.status < 400 ? "allow" : "deny", reason: r.status < 400 ? "closed" : "proxy_error", metadata: { requestId: c.get("requestId"), correlationId: c.get("correlationId") } });
    return c.newResponse(r.text, r.status as any, { "content-type": r.contentType });
  });
  return app;
}
