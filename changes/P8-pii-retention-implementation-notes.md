# P8 PII/Retention Implementation Notes

## Implemented Now (safe, no policy decision required)
- Observability redaction covers secret/token/auth/cookie/apiKey/password/vault/PKCE fields; regression test in `packages/observability/src/redaction.test.ts`.
- External side-effect routes use approval/actionHash/idempotency receipts; no blind retry on uncertain writes.
- Task export endpoints user-scoped and bounded by `HELM_TASK_EXPORT_MAX` (default 200, hard max 500).
- Task delete endpoint disabled by default; requires `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`; transactional delete + audit.
- Memory retention/consolidation dry-runs are report-only (`deleted:0, modified:0`); no auto-delete/enforcement.

## Safe Next Implementation Candidates (flag-gated, dry-run first)
- `HELM_RETENTION_DAYS_*` config values parsed but **unset = retain / no auto-delete**.
- Dry-run retention report endpoints/jobs that emit candidate counts only, no deletion.
- User-scoped export packaging with explicit redaction manifest (metadata-only default).
- Artifact cleanup job: dry-run first; delete only after approved retention window and audit.

## Explicitly Blocked / Needs Decision
- Any automatic deletion/enforcement of memory, tasks, receipts, audit, or artifacts. **Requires:** explicit approval + dry-run report + audit + legal/privacy signoff + retention windows + no vault-secret deletion.
- Export including raw message bodies, artifact binaries, or secrets/vault values. **Requires:** product/legal/privacy decision and redaction design.
- Delete semantics (soft delete/anonymize/hard delete), legal hold behavior, audit retention. **Requires:** legal/product decision.
- Backup encryption/retention/access controls and scheduled verification. **Requires:** ops/security decision.
