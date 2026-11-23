# Security/Privacy Checklist (P8 thin slice)

## Done/Partial
- [x] Approval/actionHash/idempotency for external side effects.
- [x] Auth bearer session tokens (hashed), WS auth, ownership checks.
- [x] Local AES-256-GCM vault for connector secrets.
- [x] Pino redaction for secrets/tokens/headers.
- [~] Audit log for guarded actions; coverage not complete for all routes.
- [~] Retention/deletion: no user-facing data deletion/export flow.

## Pending
- [ ] Threat model + SSRF/command-injection/dependency review pass.
- [ ] Secret rotation/revocation UX and key management hardening.
- [ ] PII retention policy, data export/delete, privacy notice.
- [ ] Backup encryption, restore drill evidence.
- [ ] CI security scan (dependency audit/SAST) with tracked exceptions.
