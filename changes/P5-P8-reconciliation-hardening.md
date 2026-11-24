> **Snapshot/historical document.** For current status use `CURRENT_STATE.md` and `phase-1`..`phase-8`. This file may contain old percentages/status.

﻿# P5/P8 Reconciliation and Hardening Notes

## Reconciliation workflow (DB-canonical)
- Uncertain external receipts are never blind-retried.
- Scheduler/route only performs provider lookups (Gmail sent lookup by idempotency header; Calendar create lookup by summary+start window).
- If lookup proves execution, receipt is marked `executed` with externalRef and audit/event metadata.
- If lookup is inconclusive, receipt remains `uncertain` and `lastReconcileAttemptAt`/lookup reason is recorded.
- External side effects remain guarded by approval + actionHash + idempotency + receipts.

## Flags/env
- `HELM_RECONCILIATION_ENABLED=1` enables in-process API scheduler tick.
- `HELM_RECONCILIATION_INTERVAL_MS` (default 60000, min 10000)
- `HELM_RECONCILIATION_OLDER_THAN_MS` (default 60000)
- `HELM_RECONCILIATION_LIMIT` (default 20, max 100)

## API
- `GET /v1/reconciliation/status` - scheduler config/policy.
- `POST /v1/reconciliation/run` - user-scoped manual run; `scope=all` only in dev/internal mode (`HELM_ALLOW_DEV_AUTH=1`).

## Remaining external blockers
- Real provider no-duplicate proof and real Google OAuth E2E need external creds/sandbox.
- CI security scan execution/triage beyond report-only audit, threat-model execution, PII retention/export/delete implementation, backup/restore drill evidence, legal/provenance signoff.
