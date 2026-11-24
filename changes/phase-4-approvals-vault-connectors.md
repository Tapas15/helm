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
- **Google Calendar**: Read-first + create/update/delete guarded with approval/actionHash/idempotency/receipt/uncertain handling/reconcile lookup.
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
- [x] Google Calendar read-first + create/update/delete guarded with approval/actionHash/idempotency/receipt/uncertain handling/reconcile lookup.
- [x] Token refresh-on-expiry; revoke hardening with configurable `GOOGLE_REVOKE_BASE`, provider outcome captured/audited.
- [x] OAuth helper tests PASS (5/5, `backend/api/src/lib/oauth.test.ts`).
- [x] Connector account status/test routes; token expiry status/UI.
- [x] Identity policy enforcement wired into Gmail/Calendar create/update/delete and browser external action (flag-aware).

### Remaining / Blocked
- [ ] **Blocked:** Real Google OAuth connect/callback/Gmail/Calendar E2E after creds configured (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect URI, test Gmail+Calendar account). See `changes/OAUTH_E2E_SETUP.md`.
- [ ] **Blocked:** Real-provider no-duplicate/uncertain-reconcile proof in provider sandbox.
- [ ] Token refresh/revoke hardening against real provider behavior.
- [ ] Richer connector diagnostics/sync UX.
- [ ] Broader connector policy matrix; full mutating endpoint/tool idempotency+audit coverage audit.
- [ ] Vault secret storage/deployment hardening for production (encrypted provider/KMS decision).
- [ ] Connector registry persistence/OAuth lifecycle polish.

## Evidence
- 2026-11-22: "Buy headphones on Amazon" paused `waiting_approval`; approve requeued; completed. External action 403 pending, 200 executed with receipt/artifact, replay deduped same receipt.
- 2026-11-24: `pnpm --filter @helm/api test -- oauth` PASS (5/5).
- Env-gated reconciliation API includes Gmail/Calendar uncertain reconciliation cases (PASS 10/10).
