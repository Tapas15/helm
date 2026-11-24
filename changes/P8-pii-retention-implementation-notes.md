# P8 PII/Retention Implementation Notes (safe baseline)

## Implemented now (no policy decision required)
- Pino redaction in observability config covers secret/token/authorization/cookie/apiKey/password fields.
- External side-effect routes persist receipts/audit with actionHash/idempotency; no raw OAuth tokens written to logs.
- Reconciliation records lookup attempt metadata only; no blind retries.

## Safe defaults to implement next (flag/config-gated)
- `HELM_RETENTION_DAYS_TASK_EVENTS` / `HELM_RETENTION_DAYS_AUDIT_LOG` / `HELM_RETENTION_DAYS_ARTIFACTS` (unset = retain; no auto-delete).
- Export endpoint: authenticated, user-scoped JSON export of tasks/messages/events/receipts/artifacts metadata (no secrets/vault values).
- Delete endpoint: authenticated, user-scoped soft/hard delete workflow with audit record and explicit confirmation token; never delete vault secrets without separate confirmed flow.
- Artifact cleanup job: deletes files + DB rows only after retention window; dry-run mode first.

## Needs your decision
- Retention windows by data class.
- Whether export includes message bodies/artifact binaries or metadata only.
- Delete semantics (soft delete/anonymize vs hard delete), legal hold behavior.
- Privacy notice/legal text for submission.
