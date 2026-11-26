# P8 Security/Privacy Checklist

## Implemented / Evidenced
- [x] Approval/actionHash/idempotency for external side effects; uncertain outcomes reconciled, no blind retry.
- [x] Auth: DB-backed bearer session tokens (hashed), WS auth, ownership checks; dev `x-user-id` fallback only when explicitly enabled and auth not required.
- [x] Browser session ownership/binding checks; legacy unbound sessions hard-blocked 403 `legacy-unbound-session-hard-block`.
- [x] Local AES-256-GCM vault for connector secrets; OAuth tokens/PKCE verifier not persisted in plaintext outside encrypted/vault paths.
- [x] Pino redaction covers secret/token/auth/cookie/apiKey/password/vault/PKCE fields; regression test PASS.
- [x] Audit log present for guarded actions (approvals, browser session/artifact/takeover/rebind, task delete, memory/consolidation/retention dry-runs where implemented).
- [x] Task export/delete: user-scoped, capped export; delete disabled by default and requires `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`; transactional delete + audit.
- [x] Backup scripts hardened (checksum, restore `-Force`, scope warnings); dry-run evidence recorded.

## Partial / Needs Depth
- [~] Audit coverage for every sensitive route/action; needs route-by-route review.
- [~] PII retention: metadata-only scaffolding and task export/delete exist; no full retention enforcement/PII classification/artifact redaction.
- [~] Dependency audit report-only in CI; triage exists, gating/remediation cadence decision pending.
- [~] Threat model baseline exists; formal STRIDE/signoff pending.

## Manual / Blocked
- [ ] Secret rotation/revocation UX and key management hardening (KMS/prod vault). **Blocked:** ops/product decision.
- [ ] CI SAST/secrets/container scanning and gating. **Blocked:** security/ops decision.
- [ ] PII retention/export/delete/legal privacy notice beyond task scaffold. **Blocked:** product/legal/privacy decision.
- [ ] Encrypted backup storage, access controls, restore drill with artifact/vault-key scope. **Blocked:** ops/manual execution.
- [ ] Incident response runbook and security signoff. **Blocked:** manual security review.
