# Current State â€” Helm

**Last updated:** 2026-11-24T17:00:00Z (P5 reconciliation schedule/fault-injection hardening landed; CI 45441229198 green; README/ROADMAP synced to 70.0%)
**Active phases:** Phase 1 UI/Task Core (`[~]`), Phase 3 Browser Execution (`[~]`), Phase 4 Approvals/Vault/Connectors (`[~]`)  
**Next move:** Run env-gated Temporal reconciliation e2e when Temporal env available; continue Drizzle migration-history alignment (non-destructive, CI-safe) and remaining P2/P4/P5/P6/P7/P8 blocked/external items. Keep DB-canonical lookup-first/no-blind-retry invariant.

## Project Identity
- **Name:** Helm (`@helm/*`)
- **Goal:** Personal AI operating assistant platform from scratch per blueprint: OpenFUSE-style control surface + Helm-native runtime + deterministic browser execution + reliability/security.
- **Blueprint:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\Personal_assistant\Planning\MASTER-TECHNICAL-BLUEPRINT.md`

## Current Status Snapshot

- **Overall:** ~70% (70.0% P0-P8 equal-weight avg); usable prototype baseline remains strong; tracker aligned to per-phase math. Unblocked P5 reconciliation hardening applied.
- **Phase 0 - Foundation:** `[~]` 91%.
- **Phase 1 - UI/Task Core:** `[~]` 91%. Chat-first UI, SSE timeline, approvals/evidence/receipts, WS preview + polling fallback, takeover controls, idempotency/follow-up guards. Added SSE stream regression (`events-sse-api` PASS 3/3, includes cursor resume + invalid cursor validation), invalid control transition regression (`task-lifecycle-api` PASS 4/4), and task-list limit validation. Web now has session-token sign-in/sign-out flow and sends bearer auth on fetch/SSE/WS/screenshot (dev `x-user-id` fallback only when `HELM_ALLOW_DEV_AUTH=1` and `HELM_REQUIRE_AUTH!=1`). Dev web `http://localhost:5173`.
- **Phase 2 - Agent Runtime:** `[~]` 73%. Local Ollama streaming + basic tool-calling loop; guardrails/allowlist/timeout/max_tokens/redaction; browser-intent gating; smoke PASS. Added exported runtime helpers + worker vitest config and unit/behavior tests (`backend/worker/src/runtime.test.ts`, `runtime.behavior.test.ts`, 11/11 PASS) covering model resolution/clamping/overrides, tool allowlist, redaction, browser-tool gating, missing-sessionId normalization, tool registry/risk metadata, tool policy enforcement, high-risk prompt classifier/approval helper, thread history abstraction, prompt guardrails, and high-risk approval gating. Worker passes runtime thread/model override context. Added `/v1/runtime/config` and `/v1/runtime/model-validate`; task create persists `settings.modelOverride`; web composer has model override + allowlist check. Pending: deeper live-runtime validation across real browser+connector flows.
- **Phase 3 - Browser Execution:** `[~]` 93%. Guarded ownership/authz, takeover, stale-session restart recovery + direct and API-observable integration coverage, WS bearer session-token authz via shared resolver. Pending: real session/OIDC UX polish, WS stability/interactive-input live smoke, richer remote control.
- **Phase 4 - Approvals/Vault/Connectors:** `[~]` 90%. Approval/receipts hardened; auth session scaffold; local vault/CredentialBroker; Gmail read/send and Calendar read/create/update/delete approval-gated with actionHash+idempotency+receipts+uncertain reconcile; web connector UI. Added oauth helper unit tests (PKCE/url/expiry/refresh grant/failure) and revoke hardening with configurable revoke endpoint + audit/providerRevoked metadata. Pending: real Google OAuth E2E (external creds), diagnostics/sync UX, token refresh/revoke hardening against real provider.
- **Phase 5 - Temporal Reliability:** `[~]` 68%. ADR-002 proposed; shared Temporal contracts/config; `@helm/temporal-worker` scaffold + guarded activity route-through-API (gmail/calendar/browser external) with uncertain mapping; API Temporal routing behind `HELM_TEMPORAL_ENABLED` fail-closed 503 + internal bypass; env-gated stub/real/mock rollback proofs PASS. DB-canonical reconciliation service/API/scheduler (lookup-first, no blind retry) PASS 10/10. Added Temporal reconciliation workflow/activity/schedule bootstrap (`helmReconciliationWorkflow`, `reconcileUncertainReceiptsActivity`, `HELM_TEMPORAL_RECONCILIATION_SCHEDULE_*`), schedule status/ensure hooks, and fault-injection guards (`HELM_RECONCILIATION_FAULT_INJECT`) preserving no-blind-retry (`8471aef`, CI `45441229198` green). Pending: real-provider no-duplicate proof, real Temporal schedule/monitor/fault-injection E2E depth, runtime/operator depth.
- **Phase 6 - BrowserOS Adapter:** `[~]` 34%. Adapter interface + Playwright default + BrowserOS HTTP adapter when `BROWSER_ADAPTER=browseros` + `BROWSEROS_BASE_URL/TOKEN` configured, explicit stub error otherwise; adapter status endpoint, dispatch flag, request/requestBinary dispatch, adapter-aware session lookup (`e5391c1`,`a91885a`,`9dc78e6`,`4bfc19c`,`69361b3`). Added browser adapter factory + BrowserOSHttpAdapter mock contract unit tests covering all actions, non-2xx error surfacing, and binary screenshot response (`backend/api/src/lib/browser-adapter.test.ts`, 6/6 PASS). Pending: real BrowserOS endpoint/protocol/parity/security tests; remaining unblocked work is limited to additional mock/dispatch contracts.
- **Phase 7 - Memory/Skills/Proactivity:** `[~]` 48%. Identity contracts/status/list/create/policy read+PATCH; identity policy enforcement helper wired into Gmail send and Calendar create/update/delete guarded routes (flag-aware `HELM_IDENTITY_ENFORCEMENT`); connector-account identity binding endpoint (`POST /v1/identity/:id/bind-connector-account`) added for policy linkage. Added optional browser external-action identity enforcement when `HELM_IDENTITY_ENFORCEMENT=1` and browser session metadata contains bound `identityId` (checks identity policy allowExternalWrites/requireApproval). Added identity policy unit tests (`backend/api/src/lib/identity-policy.test.ts`, 4/4 PASS). DB-backed notes/skills/proactivity rules behind flags. Pending: identity vault linkage/UI, broader side-effect coverage, skill execution/proactivity scheduler; self-improvement activation requires explicit approval.
- **Phase 8 - Hardening/Compliance:** `[~]` 43%. CI report-only dependency audit; dependency audit triage baseline (`ebc53bc`); non-destructive backup/restore dry-run executed to temp DB with 17-table restore verified and temp DB dropped (`79fd18c`); PII/retention implementation notes (`75907b0`); user-scoped task export endpoint (`1589e94`). Observability redaction expanded for sessionToken/vaultKey/encryptedValue/PKCE verifier paths; added redaction regression test (`packages/observability/src/redaction.test.ts` PASS). Added config-gated explicit-confirm task delete scaffold (`POST /v1/tasks/:id/delete`, requires `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`) and user-scoped bulk task metadata export (`POST /v1/tasks/export`) capped by `HELM_TASK_EXPORT_MAX`; no auto-delete/vault-secret deletion. `.env.example` documents `HELM_ALLOW_TASK_DELETE` and export cap. Env-gated task export/delete integration test added (`tests/integration/src/task-export-delete-api.test.ts`, PASS 1/1). Pending: full drill with artifacts/vault-key scope, scan triage/gating decisions, threat model execution, PII retention/export/delete policy+implementation, compliance/provenance signoff.


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
- [~] Live preview: WS screencast stream + takeover-only remote input implemented (typecheck/test PASS; live stack smoke pending).
- [~] Clean restart/recovery: persisted task/event/approval/receipt/artifact state survives restart; browser-worker restart recovery has direct+API-observable integration coverage; in-memory live WS continuity still pending.

## Context Memory (keep updated every session)

### Repo / Ops
- Repo: `https://github.com/Tapas15/helm`, branch `main`. Local git: `Tapas15 <tapas.mahanandia@gmail.com>`. CI: `.github/workflows/ci.yml` ubuntu-latest, concurrency cancel-in-progress, 20m timeout, Install/Lint/Typecheck/Build/Test, report-only `pnpm audit --audit-level=high`.
- Latest CI: `45441229198` (main, push, `8471aef`) **green** 2026-11-24. Prior green: `45438392752` (`e6f79d4`).
- Dev ports: web `5173`, API `8787`, browser-worker `8790`. Docker: `infra-postgres-1` (Postgres 16, db `helm`), `infra-redis-1` healthy. Do not touch local PG17 `postgresql-x64-17`.
- `.env` gitignored; `backups/` untracked local dir. `browseros-cli` not found.

### Safety / Invariants (never violate)
- DB task/event/receipt tables canonical user-visible state. No blind retry of uncertain external writes; lookup-first reconciliation only; proven requires provider proof.
- External/browser side effects require approved `approvalId` + matching `actionHash` + idempotency receipt; dedupe same receipt; executing claim returns 409.
- No secrets in logs/events/prompts; redaction covers sessionToken/vaultKey/encryptedValue/PKCE verifier. Vendor SDKs behind `packages/shared` contracts/adapters.
- Self-improvement design-only; requires explicit user approval before implementation/activation. No CopilotKit/`@ag-ui/*`. No Hermes/BrowserOS/OpenFUSE/NanoClaw/nanoMuse/Composio code copied.

### Current % (equal-weight P0-P8)
| Phase | % | Remaining | Main blocker/need |
|---|---:|---:|---|
| P0 Foundation | 91 | 9 | Drizzle migration-history alignment (CI-safe, non-destructive) |
| P1 UI/Task Core | 91 | 9 | SSE cursor-resume E2E proof; live UI smoke |
| P2 Agent Runtime | 73 | 27 | Live real browser+connector E2E; model/provider evidence |
| P3 Browser Execution | 93 | 7 | Live WS/takeover smoke; richer remote controls |
| P4 Connectors/Vault | 90 | 10 | Real Google OAuth E2E/no-duplicate proof (creds/test accounts) |
| P5 Temporal | 68 | 32 | Real-provider no-duplicate; real Temporal schedule/monitor/fault-injection E2E |
| P6 BrowserOS | 34 | 66 | Real BrowserOS endpoint/protocol/token/parity/security |
| P7 Identity/Memory/Skills | 48 | 52 | Identity vault/UI, skill/proactivity scheduler; self-improvement approval-gated |
| P8 Hardening/Release | 43 | 57 | Full backup/restore drill, scan gating, threat model, PII policy/impl, compliance/provenance/Dubai signoff |
| **Overall** | **70.0** | **30.0** | External creds/runtime/ops/legal decisions |

### Recently Completed (this session, 2026-11-24)
- `e6f79d4` CI fix: Build before Test; shared tests import `./temporal.js`; CI `45438392752` green.
- `8471aef` P5: Temporal reconciliation workflow/activity/schedule bootstrap, schedule status/dev-gated ensure, `HELM_RECONCILIATION_FAULT_INJECT` no-blind-retry guards, env-gated `temporal-reconciliation-e2e` scaffold; docs/FIX_LOG/CURRENT_STATE updated; CI `45441229198` green.
- `d18cea5` Docs: README/ROADMAP synced to 70.0%/CURRENT_STATE.
- `57917a7` Docs: CURRENT_STATE/SESSION_LOG updated with completed/blockers/invariants.

### Active Blockers (external/manual/approval)
- Real Google OAuth E2E/no-duplicate proof: needs `GOOGLE_CLIENT_ID/SECRET`, redirect URI, test Gmail+Calendar accounts.
- Real BrowserOS adapter: needs endpoint/protocol/token/runtime decision + parity/security tests.
- Real Temporal depth: real Temporal server schedule/monitor/fault-injection E2E; real-provider no-duplicate proof.
- Drizzle migration-history alignment: manual P7 baseline applied; `drizzle-kit push --force` TTY-blocked; `db:migrate`/CLI unresolved; needs CI-safe non-interactive path; no destructive reset without explicit approval.
- P8 manual: full backup/restore drill (artifacts/vault-key scope), CI scan gating, threat-model execution, PII retention/export/delete policy+impl, compliance/provenance/Dubai submission signoff.
- Self-improvement activation: explicit user approval required.

### Update Protocol (mandatory)
- After every meaningful work batch: update `changes/CURRENT_STATE.md`, append `changes/SESSION_LOG.md`, update relevant `changes/phase-*.md`, add `changes/FIX_LOG.md` for non-trivial fixes, keep `README.md`/`ROADMAP.md` in sync when progress changes. Do not wait for user to ask.
