# Phase 4 - Approvals / Vault / Connectors

**Status:** `[~]` 90%  
**Blueprint refs:** Phase 4, `07-Approvals-Trust-and-Safety.md`, `12-Security-Privacy-and-Compliance.md`

## Goal
High-risk actions require approval; side-effect ledger prevents double execution; vault/connector boundaries are safe and auditable.

## What we have done
- **Approvals/receipts**: Approval contract/DB/API/worker/UI; approve/reject flow; task `waiting_approval`. `action_receipts` with `task:{taskId}:action:{actionHash}` idempotency key; dedupe same receipt; executing claim 409; runtime/browser-task approved high-risk path uses guarded external-action API.
- **Vault/CredentialBroker**: Local AES-256-GCM vault + `VaultRef`; secrets not returned in API responses.
- **Auth/connector UX**: Web connector management UI; session-token sign-in/sign-out; bearer on fetch/SSE/WS/screenshot.
- **Google OAuth PKCE scaffold**: Connect/callback/revoke; callback redirects to `WEB_URL`; token refresh-on-expiry; revoke hardening with configurable `GOOGLE_REVOKE_BASE`, provider outcome captured/audited. OAuth helper tests PASS (5/5).
- **Gmail**: Read/send guarded with approval/actionHash/idempotency/receipt/uncertain handling/reconcile.
- **Google Calendar**: Read-first + create/update/delete guarded with approval/actionHash/idempotency/receipt/uncertain handling/reconcile lookup. API routes: `/v1/connectors/calendar/events/create|update|delete` (update/delete added 2026-11-25).
- **Diagnostics/policy**: Connector account status/test routes; token expiry status/UI. Identity policy enforcement wired into Gmail send, Calendar create/update/delete, and browser external action (flag-aware).

## Checklist

### Completed
- [x] Approval contract/DB/API/worker/UI baseline; approve/reject flow; task `waiting_approval`.
- [x] `action_receipts` table; approval resolve records approved receipt; worker records executed receipt; idempotency key `task:{taskId}:action:{actionHash}`.
- [x] External/browser action gate requires approved approval matching `actionHash` + `approvalId`, claims idempotency, dedupes same receipt, 409 on executing claim.
- [x] Runtime/browser-task approved high-risk path uses guarded external-action API.
- [x] Local vault/CredentialBroker (AES-256-GCM) + `VaultRef`; secrets not returned in API responses.
- [x] Web connector management UI; session-token sign-in/sign-out; bearer on fetch/SSE/WS/screenshot.
- [x] Google OAuth PKCE scaffold: connect/callback/revoke; callback redirects to `WEB_URL`.
- [x] Gmail read/send guarded with approval/actionHash/idempotency/receipt/uncertain handling/reconcile.
- [x] Google Calendar read-first + create/update/delete guarded with approval/actionHash/idempotency/receipt/uncertain handling/reconcile lookup. API routes implemented: create, update, delete (2026-11-25).
- [x] Token refresh-on-expiry; revoke hardening with configurable `GOOGLE_REVOKE_BASE`, provider outcome captured/audited.
- [x] OAuth helper tests PASS (5/5, `backend/api/src/lib/oauth.test.ts`).
- [x] Connector account status/test routes; token expiry status/UI.
- [x] Identity policy enforcement wired into Gmail/Calendar create/update/delete and browser external action (flag-aware).

### Remaining / Blocked
- [x] **Verified 2026-11-24:** Real Google OAuth connect/callback/test verified for Gmail and Calendar (simplytaps3@gmail.com). Scope fix `ddd445d` added `gmail.send` and `calendar.events`. Approval-gated Gmail send succeeded (`rcpt_7a0bc795563d405499c13f72db1c90ba`, `gmailMessageId=1a20f3b6dad91d55`); same-idempotency retry returned deduped same receipt/externalRef. Approval-gated Calendar create succeeded (`rcpt_da3b49611c3f4f4e9b1d34f63d33d5cf`, `calendarEventId=jshv868h65pplmu3tjmbtu2eo0`); same-idempotency retry deduped and calendar query showed one `Helm E2E Test` event. No auto-delete.
- [ ] Real-provider uncertain-reconcile proof in provider sandbox (forced uncertain/timeout scenarios beyond API-level cases).
- [~] Token refresh/revoke hardening (deterministic, local 2026-11-27): `getValidGoogleAccessToken` no longer returns expired access token when refresh fails/missing config; refresh success persists merged token preserving refresh_token/scope. Revoke endpoint records provider revoke failure reason and reports `providerRevoked=false` while still revoking local account/secret. Real-provider refresh/revoke behavior proof remains blocked.
- [ ] Richer connector diagnostics/sync UX.
- [ ] Broader connector policy matrix; full mutating endpoint/tool idempotency+audit coverage audit.
- [ ] Vault secret storage/deployment hardening for production (encrypted provider/KMS decision).
- [ ] Connector registry persistence/OAuth lifecycle polish.

## Evidence
- 2026-11-22: "Buy headphones on Amazon" paused `waiting_approval`; approve requeued; completed. External action 403 pending, 200 executed with receipt/artifact, replay deduped same receipt.
- 2026-11-24: `pnpm --filter @helm/api test -- oauth` PASS (5/5).
- 2026-11-24: Real Gmail/Calendar OAuth connect/test verified with write-scoped accounts (`conn_ca5f7f2ad46a44f4a4bcd45cdc3e8265`, `conn_b1a4ea9ef44548ca8d028fa4860949b7`). Gmail send approved/executed; retry deduped same receipt. Calendar create approved/executed; retry deduped same receipt; single event present. Receipts executed in DB with idempotency keys.
- Env-gated reconciliation API includes Gmail/Calendar uncertain reconciliation cases (PASS 10/10).
