# Current State â€” Helm

**Last updated:** 2026-11-24T12:45:00Z (unblocked: P2 normalizeBrowserToolArgs guard+tests, P8 export/delete env-gated integration; typecheck PASS)
**Active phases:** Phase 1 UI/Task Core (`[~]`), Phase 3 Browser Execution (`[~]`), Phase 4 Approvals/Vault/Connectors (`[~]`)  
**Next move:** Real session/OIDC UX and web token flow; encrypted vault provider + connector registry persistence/OAuth/Gmail/Calendar/reconciliation. Keep live UI E2E evidence when browser automation surface is available.

## Project Identity
- **Name:** Helm (`@helm/*`)
- **Goal:** Personal AI operating assistant platform from scratch per blueprint: OpenFUSE-style control surface + Helm-native runtime + deterministic browser execution + reliability/security.
- **Blueprint:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\Personal_assistant\Planning\MASTER-TECHNICAL-BLUEPRINT.md`

## Current Status Snapshot

- **Overall:** ~68% (68.1% P0-P8 equal-weight avg); usable prototype baseline remains strong; tracker aligned to per-phase math. Unblocked hardening/test/scaffold increment applied.
- **Phase 0 - Foundation:** `[~]` 91%.
- **Phase 1 - UI/Task Core:** `[~]` 91%. Chat-first UI, SSE timeline, approvals/evidence/receipts, WS preview + polling fallback, takeover controls, idempotency/follow-up guards. Added SSE stream regression (`events-sse-api` PASS 3/3, includes cursor resume + invalid cursor validation), invalid control transition regression (`task-lifecycle-api` PASS 4/4), and task-list limit validation. Web now has session-token sign-in/sign-out flow and sends bearer auth on fetch/SSE/WS/screenshot (dev `x-user-id` fallback only when `HELM_ALLOW_DEV_AUTH=1` and `HELM_REQUIRE_AUTH!=1`). Dev web `http://localhost:5173`.
- **Phase 2 - Agent Runtime:** `[~]` 62%. Local Ollama streaming + basic tool-calling loop; guardrails/allowlist/timeout/max_tokens/redaction; browser-intent gating; smoke PASS. Added exported runtime helpers + worker vitest config and unit/behavior tests (`backend/worker/src/runtime.test.ts`, `runtime.behavior.test.ts`, 9/9 PASS) covering model resolution/clamping, tool allowlist, redaction, browser-tool gating, missing-sessionId normalization, tool registry/risk metadata, high-risk prompt classifier, prompt guardrails, and high-risk approval gating. Pending: richer tool registry/policy, provider/model selection UI, proper thread abstraction.
- **Phase 3 - Browser Execution:** `[~]` 93%. Guarded ownership/authz, takeover, stale-session restart recovery + direct and API-observable integration coverage, WS bearer session-token authz via shared resolver. Pending: real session/OIDC UX polish, WS stability/interactive-input live smoke, richer remote control.
- **Phase 4 - Approvals/Vault/Connectors:** `[~]` 89%. Approval/receipts hardened; auth session scaffold; local vault/CredentialBroker; Gmail read/send and Calendar read/create/update/delete approval-gated with actionHash+idempotency+receipts+uncertain reconcile; web connector UI. Added oauth helper unit tests (PKCE/url/expiry) and revoke hardening with configurable revoke endpoint + audit/providerRevoked metadata. Pending: real Google OAuth E2E (external creds), diagnostics/sync UX, token refresh/revoke hardening against real provider.
- **Phase 5 - Temporal Reliability:** `[~]` 64%. Prior Temporal proofs remain. DB-canonical uncertain-receipt reconciliation covers Gmail send + Calendar create/update/delete with lookup-first/no-blind-retry; env-gated reconciliation API integration PASS 9/9 including scheduler tick and safety guards. Added reconciliation status counts/recent uncertain visibility, receipt status/limit filtering, and `POST /v1/reconciliation/dry-run` (no side effects) (`c35a722`,`625376b`,`5eb8efc`). Added env-gated dry-run integration test case in `tests/integration/src/reconciliation-api.test.ts`; `HELM_RECONCILIATION_API_TEST=1` reconciliation-api PASS 10/10. Pending: real provider no-duplicate proof (external sandbox), Temporal-native reconciliation schedules/monitors/fault-injection depth.
- **Phase 6 - BrowserOS Adapter:** `[~]` 33%. Adapter interface + Playwright default + BrowserOS HTTP adapter when `BROWSER_ADAPTER=browseros` + `BROWSEROS_BASE_URL/TOKEN` configured, explicit stub error otherwise; adapter status endpoint, dispatch flag, request/requestBinary dispatch, adapter-aware session lookup (`e5391c1`,`a91885a`,`9dc78e6`,`4bfc19c`,`69361b3`). Added browser adapter factory + BrowserOSHttpAdapter mock contract unit tests covering all actions and non-2xx error surfacing (`backend/api/src/lib/browser-adapter.test.ts`, 5/5 PASS). Pending: real BrowserOS endpoint/protocol/parity/security tests; remaining unblocked work is limited to additional mock/dispatch contracts.
- **Phase 7 - Memory/Skills/Proactivity:** `[~]` 48%. Identity contracts/status/list/create/policy read+PATCH; identity policy enforcement helper wired into Gmail send and Calendar create/update/delete guarded routes (flag-aware `HELM_IDENTITY_ENFORCEMENT`); connector-account identity binding endpoint (`POST /v1/identity/:id/bind-connector-account`) added for policy linkage. Added optional browser external-action identity enforcement when `HELM_IDENTITY_ENFORCEMENT=1` and browser session metadata contains bound `identityId` (checks identity policy allowExternalWrites/requireApproval). Added identity policy unit tests (`backend/api/src/lib/identity-policy.test.ts`, 4/4 PASS). DB-backed notes/skills/proactivity rules behind flags. Pending: identity vault linkage/UI, broader side-effect coverage, skill execution/proactivity scheduler; self-improvement activation requires explicit approval.
- **Phase 8 - Hardening/Compliance:** `[~]` 42%. CI report-only dependency audit; dependency audit triage baseline (`ebc53bc`); non-destructive backup/restore dry-run executed to temp DB with 17-table restore verified and temp DB dropped (`79fd18c`); PII/retention implementation notes (`75907b0`); user-scoped task export endpoint (`1589e94`). Observability redaction expanded for sessionToken/vaultKey/encryptedValue/PKCE verifier paths; added redaction regression test (`packages/observability/src/redaction.test.ts` PASS). Added config-gated explicit-confirm task delete scaffold (`POST /v1/tasks/:id/delete`, requires `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`) and user-scoped bulk task metadata export (`POST /v1/tasks/export`); no auto-delete/vault-secret deletion. `.env.example` documents `HELM_ALLOW_TASK_DELETE`. Env-gated task export/delete integration test added (`tests/integration/src/task-export-delete-api.test.ts`, PASS 1/1). Pending: full drill with artifacts/vault-key scope, scan triage/gating decisions, threat model execution, PII retention/export/delete policy+implementation, compliance/provenance signoff.


## User Directives (do not override without asking)
- **2026-11-23:** Use local Ollama (installed, no external API key). Add model/tool guardrails; pick strongest local tool-capable model; run browser-tool E2E smoke with approvals. Only ask if user wants hosted model/API key or all local models unreliable for tool calls.
- **2026-11-23:** Hermes-like self-improvement requested; design doc created (changes/DESIGN-self-improvement-loop.md) - not implemented. Ask before implementing/activating autonomous behavior.
- **2026-11-23:** If planning conflicts with explicit user conversation directives, record conflict in changes/ and ask before major changes. Keep continuation/summary chunk in changes/.
- **Standing:** Do not use/touch local PG17 postgresql-x64-17 panic service.
## Usable Prototype Definition
- [~] Create browser task -> see preview/session status.
- [x] Request takeover/resume from UI; control state persisted/emitted; agent pauses and resumes.
- [x] Risky browser action pauses for approval; approved action executes once via guarded `actionHash`+idempotency path; reject blocks.
- [x] Evidence artifacts/receipts persisted and visible in UI/API.
- [~] Live preview: WS screencast stream + takeover-only remote input implemented (typecheck/test PASS; live stack smoke pending).`n- [~] Clean restart/recovery: persisted task/event/approval/receipt/artifact state survives restart; browser-worker restart recovery has direct+API-observable integration coverage; in-memory live WS continuity still pending.
































