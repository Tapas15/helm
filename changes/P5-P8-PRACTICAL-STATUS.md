# Helm - P5-P8 Current Practical Status

## Can run now (local)
- Local API/web/worker/browser-worker with Postgres/Redis; Ollama model.
- Approval-gated Gmail send, Calendar create/update/delete, guarded browser external actions.
- Temporal routing behind flags; direct guarded path fallback; stub/real-dedupe/mock-side-effect/rollback E2E proofs; DB-canonical uncertain-receipt reconciliation service/route/scheduler (no blind retry).
- Agent-owned identity baseline: create/list helm-owned identities, restrictive default policy, identity policy read.
- Memory notes behind `HELM_MEMORY_ENABLED` (default off).

## External/manual blockers
- Real Google OAuth E2E: `GOOGLE_CLIENT_ID/SECRET`.
- Real-provider Temporal no-duplicate proof: provider sandbox/creds.
- BrowserOS real endpoint/protocol/parity: BrowserOS runtime/protocol target.
- P8 ops/compliance: backup/restore drill execution, security-scan triage/gating, threat model execution, PII retention/export/delete implementation, legal/provenance signoff.
- Self-improvement activation: explicit user approval required.

## Safe defaults
- External writes require approval + actionHash + idempotency + receipts; uncertain outcomes reconciled, never blind-retried.
- Memory disabled by default; delegated identity disabled; Temporal/adapter dispatch behind flags.
