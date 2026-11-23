import { createDb } from "@helm/db";
import { createLogger } from "@helm/observability";

type ExecuteInput = {
  taskId: string; userId: string; actionKind: string; actionHash: string;
  idempotencyKey: string; approvalId: string; payload: Record<string, unknown>;
};

type ExecuteResult = { receiptId: string; status: string; externalRef?: string | null; raw?: unknown };

async function postApi(path: string, body: unknown, userId: string): Promise<{ ok: boolean; status: number; json: any }> {
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8787";
  const internalToken = process.env.HELM_INTERNAL_TOKEN;
  const temporalSecret = process.env.HELM_TEMPORAL_ACTIVITY_SECRET;
  const headers: Record<string, string> = { "content-type": "application/json", "x-helm-temporal-activity": "1" };
  if (temporalSecret) headers["x-helm-temporal-activity-secret"] = temporalSecret;
  if (internalToken) headers.authorization = `Bearer ${internalToken}`;
  else headers["x-user-id"] = userId; // dev fallback; requires HELM_ALLOW_DEV_AUTH=1
  const res = await fetch(`${apiUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export function createActivities() {
  const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";
  createDb(dbUrl); // validates config; activities use API guarded paths for side effects
  const log = createLogger({ name: "helm-temporal-activities" });

  return {
    async executeApprovedAction(input: ExecuteInput): Promise<ExecuteResult> {
      log.info({ taskId: input.taskId, actionKind: input.actionKind, approvalId: input.approvalId, idempotencyKey: input.idempotencyKey }, "temporal.executeApprovedAction");
      if (input.actionKind === "gmail.send") {
        const p = input.payload as any;
        const r = await postApi("/v1/connectors/gmail/send", {
          accountId: p.accountId, to: p.to, subject: p.subject, bodyText: p.bodyText,
          idempotencyKey: input.idempotencyKey, approvalId: input.approvalId, actionHash: input.actionHash,
        }, input.userId);
        if (!r.ok) {
          const uncertain = r.status >= 500 || r.status === 429 || r.status === 503;
          if (uncertain) return { receiptId: String(r.json?.error?.details?.receiptId ?? `rcpt_unknown`), status: "uncertain", raw: r.json };
          throw new Error(`gmail.send failed: ${r.status} ${JSON.stringify(r.json?.error ?? r.json).slice(0, 300)}`);
        }
        return { receiptId: String(r.json?.receiptId ?? ""), status: "executed", externalRef: r.json?.gmailMessageId ?? null, raw: r.json };
      }
      if (input.actionKind === "calendar.create_event") {
        const p = input.payload as any;
        const r = await postApi("/v1/connectors/calendar/events/create", {
          accountId: p.accountId, calendarId: p.calendarId ?? "primary", summary: p.summary, description: p.description,
          startIso: p.startIso, endIso: p.endIso, timeZone: p.timeZone, attendees: p.attendees ?? [],
          idempotencyKey: input.idempotencyKey, approvalId: input.approvalId, actionHash: input.actionHash,
        }, input.userId);
        if (!r.ok) {
          const uncertain = r.status >= 500 || r.status === 429 || r.status === 503;
          if (uncertain) return { receiptId: String(r.json?.error?.details?.receiptId ?? `rcpt_unknown`), status: "uncertain", raw: r.json };
          throw new Error(`calendar.create_event failed: ${r.status} ${JSON.stringify(r.json?.error ?? r.json).slice(0, 300)}`);
        }
        return { receiptId: String(r.json?.receiptId ?? ""), status: "executed", externalRef: r.json?.calendarEventId ?? null, raw: r.json };
      }
      if (input.actionKind === "calendar.delete_event") {
        const p = input.payload as any;
        const r = await postApi("/v1/connectors/calendar/events/delete", {
          accountId: p.accountId, calendarId: p.calendarId ?? "primary", eventId: p.eventId,
          idempotencyKey: input.idempotencyKey, approvalId: input.approvalId, actionHash: input.actionHash,
        }, input.userId);
        if (!r.ok) {
          const uncertain = r.status >= 500 || r.status === 429 || r.status === 503;
          if (uncertain) return { receiptId: String(r.json?.error?.details?.receiptId ?? `rcpt_unknown`), status: "uncertain", raw: r.json };
          throw new Error(`calendar.delete_event failed: ${r.status} ${JSON.stringify(r.json?.error ?? r.json).slice(0, 300)}`);
        }
        return { receiptId: String(r.json?.receiptId ?? ""), status: "executed", externalRef: r.json?.calendarEventId ?? null, raw: r.json };
      }
      if (input.actionKind === "browser.external_action") {
        const p = input.payload as any;
        const sessionId = String(p.sessionId ?? "");
        const r = await postApi(`/v1/browser/sessions/${encodeURIComponent(sessionId)}/external-action`, {
          approvalId: input.approvalId, actionHash: input.actionHash, idempotencyKey: input.idempotencyKey,
          action: p.action, params: p.params ?? {},
        }, input.userId);
        if (!r.ok) {
          const uncertain = r.status >= 500 || r.status === 429 || r.status === 503;
          if (uncertain) return { receiptId: String(r.json?.error?.details?.receiptId ?? `rcpt_unknown`), status: "uncertain", raw: r.json };
          throw new Error(`browser.external_action failed: ${r.status} ${JSON.stringify(r.json?.error ?? r.json).slice(0, 300)}`);
        }
        return { receiptId: String(r.json?.data?.receiptId ?? r.json?.receiptId ?? ""), status: "executed", externalRef: r.json?.data?.artifact?.artifactId ?? null, raw: r.json };
      }
      throw new Error(`Unsupported temporal actionKind: ${input.actionKind}`);
    },
  };
}
