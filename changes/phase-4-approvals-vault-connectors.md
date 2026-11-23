# Phase 4 - Approvals + Security Boundaries

**Status:** `[~]` In progress  
**Blueprint refs:** Phase 4, `07-Approvals-Trust-and-Safety.md`, `12-Security-Privacy-and-Compliance.md`

## Goal
High-risk actions require user approval; side-effect ledger prevents double execution; vault handles secrets safely.

## Completed
- [x] Approval contract/DB/API/worker/UI baseline.
- [x] High-risk actions pause before execution; approve/reject flow works in smoke path.
- [x] `action_receipts` table added; approval resolve records approved receipt; worker records executed receipt for approved runs (idempotency key `task:{taskId}:action:{actionHash}`).
- [x] External browser action gate: `POST /v1/browser/sessions/:id/external-action` requires approved approval matching `actionHash` + `approvalId`, claims idempotency key, executes only after claim, records executed/failed receipt, emits `browser.external_action.executed` event + audit, dedupes same idempotency key.
- [x] Runtime/browser-task approved high-risk path calls guarded external-action API (no direct unguarded external side effect in that path). Smoke: task paused `waiting_approval`, approve -> succeeded, executed receipt + `browser.external_action.executed` event recorded.

## Remaining
- [~] Bind approval to specific action hash + evidence in all execution paths (coverage audit still needed). Worker hardened to not auto-mark `browser.*`/`external.*` approvals executed without guarded receipt.
- [ ] Takeover/vault/connector receipts hardening.
- [ ] Vault/secret storage boundary; no secret leakage in logs/events/UI.
- [ ] Policy engine and command tiers.

## Verification Evidence
- 2026-11-23: 	ests/integration/src/browser-external-action.test.ts PASS - BrowserExternalActionInput requires approvalId/actionHash/idempotencyKey.
- 2026-11-22: “Buy headphones on Amazon” paused `waiting_approval`; approve requeued and task completed.
- 2026-11-22: `action_receipts`/`browser_artifacts` schema applied in Docker Postgres; browser artifact rows persisted.
- 2026-11-22: external action smoke - pending approval returned 403 `FORBIDDEN`; approved action returned 200 with receipt/artifact; replay returned deduped same receipt.
- 2026-11-23: runtime-approved high-risk browser task executed through guarded external-action path; receipt status `executed` with result; `browser.external_action.executed` event recorded.

