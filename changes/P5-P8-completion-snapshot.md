# P5-P8 Completion Snapshot (auto-continued)

## Finished in code/docs (unblocked)
- P5: feature-flagged Temporal routing for Gmail/Calendar create/update/delete/browser external actions; stub/real-dedupe/mock-side-effect/rollback E2E proofs; runbook.
- P6: BrowserOS adapter interface + Playwright default + stub; status endpoint; dispatch flag; request/requestBinary adapter wiring; adapter-aware session lookup.
- P7: identity contracts; `/v1/identity/status`; helm-owned identity creation with restrictive default policy; DB-backed memory notes behind `HELM_MEMORY_ENABLED`; `identities/identity_policies/memory_notes` schema.
- P8: backup/restore scripts+runbook, security/privacy checklist, release-evidence checklist.

## Blocked / requires external input or manual ops
- Real Google OAuth connect/callback/Gmail/Calendar E2E: needs `GOOGLE_CLIENT_ID/SECRET`.
- Real-provider Temporal no-duplicate proof: needs provider sandbox/creds.
- Backup/restore drill execution evidence on real snapshot.
- CI security scan/threat model/PII retention-export-delete implementation.
- BrowserOS real endpoint/protocol + parity tests (requires BrowserOS runtime/protocol decision).
- Self-improvement activation: explicit user approval required before implementation/activation.

## Safe defaults preserved
- External writes approval-gated + actionHash + idempotency receipts + uncertain reconciliation.
- Memory disabled by default; identity delegated bridge disabled.
- Temporal/adapter dispatch behind flags.
