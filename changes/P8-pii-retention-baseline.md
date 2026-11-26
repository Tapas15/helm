# P8 PII/Retention Baseline

## Data Classes
| Class | Examples | Sensitivity | Current default |
|---|---|---:|---|
| Secrets/tokens | OAuth tokens, PKCE verifier, session tokens, vault keys, API keys | Critical | Vault-encrypted or env-only; hashed session tokens; redacted from logs/events |
| Task/control-plane data | tasks, messages, events, approvals, receipts, audit, memory notes | High/Medium | DB-canonical; user-scoped access; export/delete controls exist for tasks |
| Browser artifacts | screenshots, snapshots, paths/metadata | High (may contain PII/secrets) | Ownership-checked; artifact listing metadata-only (no path); treated sensitive |
| Backups/logs | pg_dump files, logs, CI artifacts | High | Local/operator-managed; scripts emit checksum; no encrypted backup policy yet |

## Implemented Controls
- Redaction in observability logger covers common secret/auth/token/cookie/vault/PKCE paths; regression test exists.
- No raw OAuth code/verifier/token intended in logs/events; vault stores encrypted connector secrets.
- Task export: user-scoped, bounded (`HELM_TASK_EXPORT_MAX`, hard max 500).
- Task delete: disabled by default; requires `HELM_ALLOW_TASK_DELETE=1` and `x-helm-confirm-delete: yes`; transactional delete + audit.
- Memory endpoints flag-gated/fail-closed; disabled paths return FORBIDDEN without note leakage; retention/consolidation are dry-run/report-only.

## Pending (blocked/decision needed)
- Retention windows by data class and legal hold behavior. **Blocked:** product/legal/privacy.
- Export semantics: metadata-only vs include message bodies/artifact binaries; redaction/DSAR packaging. **Blocked:** product/legal.
- Delete semantics: soft/anonymize/hard; cascade/receipt/audit retention requirements. **Blocked:** product/legal.
- Artifact PII classification/redaction pipeline and storage retention. **Blocked:** product/legal/ops.
- Encrypted backup storage, access controls, retention, and restore drill evidence. **Blocked:** ops/manual.
