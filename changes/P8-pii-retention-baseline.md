# PII/Retention Baseline (P8)

## Default data classes
- **Secrets/tokens**: vault-encrypted at rest; never logged in plaintext; redact in events/audit.
- **Task/event/audit/receipts**: retained for traceability; contain operational metadata, not raw secret values.
- **Artifacts/screenshots**: may contain PII; treat as sensitive evidence; access requires authz.

## Baseline controls
- Redact authorization/cookie/token/secret fields in logs and stored metadata.
- Do not persist raw OAuth code/verifier/token outside vault/encrypted state.
- Approval/actionHash/idempotency receipts retained for external-write auditability.

## Pending implementation
- User-facing export/delete/retention policy controls.
- Configurable retention windows and purge job with audit trail.
- Artifact PII classification/redaction pipeline.
- Privacy notice and compliance signoff.
