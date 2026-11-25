# Fix Log â€” Helm

> Append-only record of problems diagnosed/fixed. Every non-trivial fix must be recorded here and, when applicable, in audit logs/events.

## Template

## FIX-YYYYMMDD-short-slug
- **Date:** YYYY-MM-DDTHH:MM:SSZ
- **Reporter:** user | agent | ci | monitor
- **Severity:** low | medium | high | critical
- **Component:** api | worker | web | db | infra | shared | docs | ...
- **Symptom:**
- **Root cause:**
- **Evidence:** log/event/trace/test refs
- **Fix applied:** files changed, commands
- **Verification:** commands run + pass/fail
- **Regression test:** added/path or N/A
- **Risk/rollback:**
- **Audit/event IDs:** task/event/audit refs
- **Status:** open | mitigated | fixed | verified

## FIX-20261125-browseros-click-fill-selector-detection
- **Date:** 2026-11-25T00:10:00Z
- **Reporter:** agent
- **Severity:** medium
- **Component:** api/browser-adapter (P6 BrowserOS MCP)
- **Symptom:** BrowserOS MCP click/fill on missing selectors could be misreported as success because `evaluate_in_page` script text was not parsed as a structured selector result.
- **Root cause:** Executor used action completion semantics without reliably interpreting evaluate_in_page return value for missing-element cases.
- **Evidence:** Local env-gated BrowserOS MCP smoke run against `http://127.0.0.1:9210/mcp` required selector-not-found assertions; commit `0616ad1` (local, unpushed).
- **Fix applied:** `backend/api/src/lib/browseros-mcp-executor.ts` - click/fill evaluate scripts return `selector_not_found|ok`; executor parses result and classifies missing selector as `BROWSEROS_SELECTOR_NOT_FOUND` (retryable false). `browseros-mcp-smoke.test.ts` expects structured selector-not-found errors for click/fill.
- **Verification:** `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit` PASS; `pnpm -C backend/api test -- browser-adapter` PASS (12/12); `HELM_BROWSEROS_MCP_SMOKE=1 BROWSEROS_MCP_URL=http://127.0.0.1:9210/mcp BROWSEROS_MCP_SMOKE_URL=https://example.com BROWSEROS_MCP_TIMEOUT_MS=45000 pnpm -C backend/api test -- browseros-mcp-smoke` PASS (3/3, screenshot best-effort).
- **Regression test:** `backend/api/src/lib/browser-adapter.test.ts` (contract), `backend/api/src/routes/browseros-mcp-smoke.test.ts` (env-gated parity smoke).
- **Risk/rollback:** Low; scoped to BrowserOS MCP adapter path. Rollback by reverting `0616ad1`; Playwright remains default.
- **Audit/event IDs:** commit `0616ad1` (local unpushed).
- **Status:** verified (local/env-gated); CI pending push.

---

## FIX-20261122-phase0-typecheck-blockers
- **Date:** 2026-11-22T17:40:00Z
- **Reporter:** agent
- **Severity:** medium
- **Component:** shared, api, worker
- **Symptom:** `pnpm typecheck` failed across workspace.
- **Root cause:** `@helm/shared` missing `@types/node` for `node:crypto`; `@helm/api` missing `drizzle-orm` dependency; worker lease claim guard compared nullable column with nullable candidate value causing TS overload error.
- **Evidence:** `pnpm typecheck` output in session.
- **Fix applied:** `packages/shared/package.json`, `packages/shared/tsconfig.json`; `backend/api/package.json`; `backend/worker/src/index.ts` claim guard changed to `or(isNull(tasks.leaseOwner), eq(tasks.leaseOwner, workerId))`.
- **Verification:** `pnpm install --force` PASS; `pnpm typecheck` PASS (6/6).
- **Regression test:** N/A (add worker claim unit test in Phase 0 hardening).
- **Risk/rollback:** Low; revert specific files.
- **Audit/event IDs:** session log 2026-11-22T17:40:00Z.
- **Status:** verified

## FIX-20261122-web-postcss-build
- **Date:** 2026-11-22T17:45:00Z
- **Reporter:** agent
- **Severity:** medium
- **Component:** web
- **Symptom:** Vite build failed parsing PostCSS config with unexpected BOM/JSON parse error from workspace search.
- **Root cause:** Vite PostCSS config discovery searched up and hit incompatible config resolution in environment.
- **Evidence:** `pnpm --filter @helm/web build` failure.
- **Fix applied:** `frontend/web/vite.config.ts` set `css.postcss.plugins=[]`.
- **Verification:** `pnpm --filter @helm/web build` PASS; `pnpm build` PASS.
- **Regression test:** N/A (CI build covers).
- **Risk/rollback:** Low; remove explicit postcss override if real PostCSS config added.
- **Audit/event IDs:** session log 2026-11-22T17:50:00Z.
- **Status:** verified

## FIX-20261122-missing-dev-user-seed
- **Date:** 2026-11-22T17:50:00Z
- **Reporter:** agent
- **Severity:** medium
- **Component:** db/bootstrap
- **Symptom:** `POST /v1/tasks` returned INTERNAL_ERROR.
- **Root cause:** `tasks.user_id` FK requires user row; dev auth fallback used `usr_local_dev` but DB had no seed user.
- **Evidence:** Postgres log: FK violation `tasks_user_id_users_id_fk`; API 500.
- **Fix applied:** Manual SQL seed `INSERT INTO users ... usr_local_dev ON CONFLICT DO NOTHING`.
- **Verification:** Task create PASS; worker completed; events replay PASS.
- **Regression test:** N/A - add automated bootstrap/seed in Phase 0 hardening.
- **Risk/rollback:** Low.
- **Audit/event IDs:** session log 2026-11-22T17:50:00Z.
- **Status:** mitigated (needs automated bootstrap)

## FIX-20261122-phase0-task-control-shared
- **Date:** 2026-11-22T18:35:00Z
- **Reporter:** agent
- **Severity:** medium
- **Component:** shared, api
- **Symptom:** Task control transitions duplicated in API route; no shared helper/tests for transition validity; lint scripts were echo-only.
- **Root cause:** Phase 0 scaffold kept control logic local and used placeholder lint scripts.
- **Evidence:** `backend/api/src/routes/tasks.ts` local `CONTROL_TRANSITIONS`; package lint scripts `echo lint-*`.
- **Fix applied:** Added `packages/shared/src/task-control.ts` with allowed-from map, assertion/helper, terminal status set; exported from shared index; API route now uses shared helper. Added `task-control.test.ts` and `errors.test.ts`. Updated all package lint scripts to `tsc -p tsconfig.json --noEmit`. Added idempotent API dev-user bootstrap on startup.
- **Verification:** `pnpm --filter @helm/shared test` PASS (15 tests); `pnpm typecheck` PASS; `pnpm lint` PASS; `pnpm test` PASS; `pnpm build` PASS.
- **Regression test:** `packages/shared/src/task-control.test.ts`, `packages/shared/src/errors.test.ts`.
- **Risk/rollback:** Low; revert shared helper/export and route import.
- **Audit/event IDs:** session log 2026-11-22T18:35:00Z.
- **Status:** verified


## FIX-20261122-api-worker-dev-tsx-shared-resolution
- **Date:** 2026-11-22
- **Area:** backend/api, backend/worker dev startup
- **Symptom:** pnpm --filter @helm/api dev (	sx watch) failed with @helm/shared missing export CreateTaskInput; worker 	sx watch similarly failed resolving @helm/db exports. Node ESM from dist resolved correctly.
- **Root cause (suspected):** tsx/ESM dev resolution against workspace package export conditions/paths was inconsistent with built dist exports in this environment.
- **Fix:** Use compiled 
ode dist/index.js / pnpm start for smoke; keep build green. Needs proper dev-path fix (tsconfig paths/tsx config or source-condition exports) before relying on watch mode.
- **Verification:** pnpm build PASS; API /health OK; POST /v1/tasks -> worker completed -> events replayed 	ask.created/running/completed; SSE stream returned events.
- **Regression test:** TODO (dev startup smoke script/CI check).

## FIX-20261123-runtime-model-guardrails-local-ollama
- **Date:** 2026-11-23
- **Area:** backend/worker runtime, local Ollama model execution
- **Symptom:** Runtime used model config without explicit timeout/max-token/tool-capability guardrails; small/unreliable local models could leak tool schema, refuse, or hang tool-calling flows. No explicit local-first Ollama allowlist/default in env.
- **Root cause (suspected):** MVP runtime prioritized basic tool-calling loop over model reliability guardrails and operator-configurable limits.
- **Fix:** Added `HELM_MODEL_TIMEOUT_MS`, `HELM_MODEL_MAX_TOKENS`, `HELM_MODEL_TOOL_CAPABLE_ALLOWLIST` handling in `backend/worker/src/runtime.ts`; defaulted local model to `llama3.2:latest`; added tool-capability allowlist guardrail for Ollama models; redacted model error strings; enforced approvalId/actionHash/idempotencyKey presence for `browser_click` tool; tightened system prompt guardrails; added request timeout/AbortController to model fetch.
- **Verification:** `pnpm --filter @helm/worker typecheck` PASS; `pnpm --filter @helm/worker test -- runtime` PASS (1/1). Local Ollama probes: `llama3.2:latest` tool-call PASS, `qwen2.5:latest` tool-call PASS, `qwen3.5:latest`/`qwen3:4b` timed out at 90s in probe. API E2E smoke with restarted worker/API/browser-worker: assistant task `task_92146b100cc04f04b601b15e92e4cf99` succeeded with `HELM_OK` and Ollama deltas; browser high-risk task `task_d43b586c851f4106be09c31d0a711715` moved to `waiting_approval`, approval `apr_47f3e9b3a71b431fa4c073cf040aa80b` approved, task completed, `browser.external_action.executed` emitted, receipt `rcpt_7ab4a67007bc44de801aed8d2b433075` executed with artifact.
- **Regression test:** Existing `backend/worker/src/runtime.test.ts` PASS; add dedicated guardrail/allowlist/timeout tests (TODO).
- **Risk/rollback:** Low-medium. Guardrail may reject previously configured unallowlisted Ollama models; rollback by removing allowlist check or setting `HELM_MODEL_TOOL_CAPABLE_ALLOWLIST`.

## FIX-20261123-runtime-browser-tool-gating
- **Date:** 2026-11-23
- **Area:** backend/worker runtime tool policy
- **Symptom:** Normal assistant prompt (`"What is Helm in one short sentence?"`, task `task_f33a83f5f4b3430a9ffd1461c42ee45c`) triggered `browser_snapshot` with missing sessionId, causing NOT_FOUND tool result and confused assistant response asking for approval/action hash.
- **Root cause (suspected):** Browser tools were always exposed with `tool_choice:auto`, and system prompt did not strongly prohibit browser-tool use for non-browser questions.
- **Fix:** Gate browser tools to browser tasks, active browser session context, or explicit browser-intent prompts; omit tools for normal assistant questions; require sessionId in browser_navigate/snapshot/click handlers; tighten prompt guardrails.
- **Verification:** `pnpm --filter @helm/worker typecheck` PASS. Post-fix smoke `task_25ceee8885e440e187981008a909bd00` succeeded with normal answer and no `runtime.tool.*` events.
- **Regression test:** TODO - add runtime test asserting no browser tools exposed/called for plain assistant prompt without browser context.
- **Risk/rollback:** Low; may reduce model ability to opportunistically browse. Rollback by restoring unconditional tool exposure.

## FIX-20261123-task-create-message-idempotency-metadata
- **Date:** 2026-11-23T10:19:08Z
- **Reporter:** agent
- **Severity:** low
- **Component:** api/tasks
- **Symptom:** Initial task-create user message metadata did not persist the task idempotency key, reducing traceability for replay/debug.
- **Root cause:** `POST /v1/tasks` wrote `metadata` with `source/requestId/correlationId` only.
- **Evidence:** commit `c55dc2e fix(api): record idempotency key on task create message metadata` (`backend/api/src/routes/tasks.ts`).
- **Fix applied:** Persist `idempotencyKey: idemKey ?? null` in initial task message metadata.
- **Verification:** Commit pushed on `main`; `HELM_INTEGRATION_API=1 pnpm --filter @helm/integration-tests test -- task-lifecycle-api` PASS (2/2) on 2026-11-23 includes metadata assertion.
- **Regression test:** `tests/integration/src/task-lifecycle-api.test.ts`.
- **Risk/rollback:** Low; remove metadata field.
- **Audit/event IDs:** `c55dc2e`.
- **Status:** verified

## FIX-20261123-cancelled-task-follow-up-guard
- **Date:** 2026-11-23T10:22:38Z
- **Reporter:** agent
- **Severity:** medium
- **Component:** api/tasks
- **Symptom:** Follow-up messages could implicitly revive/requeue a cancelled task.
- **Root cause:** `POST /v1/tasks/:id/messages` checked running/planning conflicts but did not reject `cancelled` status before inserting follow-up and setting `queued`.
- **Evidence:** commit `d2a83fa fix(api): reject follow-up messages on cancelled tasks` (`backend/api/src/routes/tasks.ts`).
- **Fix applied:** Return `409 INVALID_TRANSITION` with `"Cancelled task cannot accept follow-up; create a new task"` when task status is `cancelled`.
- **Verification:** Commit pushed on `main`; `HELM_INTEGRATION_API=1 pnpm --filter @helm/integration-tests test -- task-lifecycle-api` PASS (2/2) on 2026-11-23 includes cancelled follow-up 409/no-revive assertion.
- **Regression test:** `tests/integration/src/task-lifecycle-api.test.ts`.
- **Risk/rollback:** Low; clients relying on revive-by-follow-up (undesired) will receive 409.
- **Audit/event IDs:** `d2a83fa`.
- **Status:** verified

## FIX-20261123-browser-takeover-ownership-test-tightening
- **Date:** 2026-11-23T10:02:42Z
- **Reporter:** agent
- **Severity:** low
- **Component:** integration-tests/browser
- **Symptom:** Takeover ownership integration test covered request/resume separately with duplicated assertions; coverage was less compact and easier to drift.
- **Root cause:** Test written incrementally during ownership hardening.
- **Evidence:** commit `0a3db45 test: tighten browser takeover ownership coverage` (`tests/integration/src/browser-takeover-ownership-api.test.ts`).
- **Fix applied:** Consolidated request/resume cross-user denial checks into a shared loop expecting 403/404.
- **Verification:** Commit pushed on `main`; targeted test not re-run in this session. Earlier `HELM_INTEGRATION_API=1` browser ownership suites passed in recent sessions.
- **Regression test:** `tests/integration/src/browser-takeover-ownership-api.test.ts`.
- **Risk/rollback:** None.
- **Audit/event IDs:** `0a3db45`.
- **Status:** verified

## FIX-20261123-browser-worker-stale-session-recovery
- **Date:** 2026-11-23T11:04:00Z
- **Reporter:** agent
- **Severity:** high
- **Component:** browser-worker/playwright
- **Symptom:** Browser sessions could become unusable after browser-worker restart or stale Playwright target/browser closure; in-memory session loss made active session recovery unreliable.
- **Root cause:** `ensure()` only returned in-memory session or attempted restore when absent; stale/closed targets were not detected/discarded before action, and action failures did not attempt deterministic restore+retry.
- **Evidence:** Manual restart smoke: created `bs_88700b403efa4387ae811ca809fc6eca`, navigated to example.com, stopped browser-worker tsx process, restarted worker, `GET /v1/sessions/:id` restored session with `status=ready` and `control.owner=agent`, navigate+screenshot succeeded.
- **Fix applied:** Added `isStaleTargetError()` export; detect stale closed/disconnected sessions in `ensure()`; discard stale sessions; on stale-target action/input failure, discard+restore and retry action once (mark `recovered:true` on successful retry); allow `streamStatus` during takeover for observability. Added env-gated restart recovery integration test.
- **Verification:** `pnpm --filter @helm/browser-worker typecheck` PASS; `pnpm --filter @helm/browser-worker test` PASS (1/1); manual restart smoke PASS (session restored, navigate PASS, screenshot PASS); `HELM_BROWSER_RECOVERY_TEST=1 pnpm --filter @helm/browser-worker test -- playwrightExecutor.recovery` PASS (1/1) on 2026-11-23.
- **Regression test:** `backend/browser-worker/src/playwrightExecutor.test.ts`, `backend/browser-worker/src/playwrightExecutor.recovery.test.ts`.
- **Risk/rollback:** Medium; restore retries may mask persistent browser corruption. Rollback by removing stale detection/retry and keeping restore-on-missing only.
- **Audit/event IDs:** `4045ce3`, `4ad4820`.
- **Status:** verified

## FIX-20261123-browser-restart-recovery-api-observable
- **Date:** 2026-11-23T12:24:00Z
- **Reporter:** agent
- **Severity:** medium
- **Component:** api/browser-worker integration
- **Symptom:** Browser-worker restart recovery had direct worker-level coverage, but no API-observable regression proving the full API path could still fetch/navigate/screenshot a persisted session after browser-worker restart.
- **Root cause:** Prior recovery test exercised browser-worker directly; API proxy/ownership path was untested across worker restart.
- **Evidence:** New env-gated integration test boots isolated browser-worker+API, creates task+session through API, navigates, restarts browser-worker, then verifies API GET/navigate/screenshot succeed for same session.
- **Fix applied:** Added `tests/integration/src/browser-restart-recovery-api.test.ts` (env-gated by `HELM_BROWSER_RECOVERY_API_TEST=1`).
- **Verification:** `pnpm --filter @helm/integration-tests typecheck` PASS; `$env:HELM_BROWSER_RECOVERY_API_TEST='1'; pnpm --filter @helm/integration-tests test -- browser-restart-recovery-api` PASS (1/1, ~34.9s) on 2026-11-23.
- **Regression test:** `tests/integration/src/browser-restart-recovery-api.test.ts`.
- **Risk/rollback:** Low; test-only. Remove test if it proves flaky in constrained environments.
- **Audit/event IDs:** pending commit.
- **Status:** verified


## FIX-20261124-reconciliation-uncertain-receipt-baseline
- **Date:** 2026-11-24T03:45:00Z
- **Reporter:** agent
- **Severity:** high
- **Component:** api/reconciliation, receipts, temporal-ops
- **Symptom:** Uncertain external receipts could be manually reconciled, but there was no scheduler/route baseline for lookup-first reconciliation; operators lacked a no-blind-retry automation path.
- **Root cause:** P5 reconciliation workflow/monitors not implemented; only manual /v1/receipts/:id/reconcile existed.
- **Evidence:** ackend/api/src/routes/evidence.ts manual reconcile only; changes/phase-5-temporal-reliability.md listed reconciliation workflow pending.
- **Fix applied:** Added ackend/api/src/lib/reconciliation.ts DB-canonical lookup-first reconciler (Gmail/Calendar lookup, no blind retry, audit log + task event on reconcile), ackend/api/src/routes/reconciliation.ts (GET /status, POST /run user-scoped; scope=all dev/internal only), wired into API index with optional interval scheduler behind HELM_RECONCILIATION_*; added env vars in .env.example; added report-only pnpm audit --audit-level=high CI step; added shared reconciliation invariant test.
- **Verification:** pnpm --filter @helm/shared build PASS; pnpm --filter @helm/api typecheck PASS; pnpm --filter @helm/shared test PASS (8 files, 25 tests).
- **Regression test:** packages/shared/src/reconciliation.test.ts (routing invariants); follow-up needed for env-gated API reconciliation integration with mock provider lookup.
- **Risk/rollback:** Low-medium; scheduler is flag-off by default. Rollback by setting HELM_RECONCILIATION_ENABLED=0 and removing route/scheduler wiring.
- **Audit/event IDs:** receipt.reconciled audit/task event emitted by scheduler on successful lookup.
- **Status:** partial (local baseline verified; real provider/Temporal-native schedule/monitor pending).


## 2026-11-24 - P5 Temporal reconciliation schedule/fault-injection hardening

- **Files**: `packages/shared/src/temporal.ts`, `packages/shared/src/temporal.test.ts`, `backend/api/src/lib/temporal.ts`, `backend/api/src/lib/reconciliation.ts`, `backend/api/src/routes/reconciliation.ts`, `backend/temporal-worker/src/workflows.ts`, `backend/temporal-worker/src/activities.ts`, `backend/temporal-worker/src/index.ts`, `tests/integration/src/temporal-reconciliation-e2e.test.ts`, `.env.example`, `changes/phase-5-temporal-reliability.md`, `changes/CURRENT_STATE.md`
- **Problem**: Uncertain receipt reconciliation had DB-canonical lookup-first service/API/scheduler, but Temporal-native reconciliation schedule/monitor/fault-injection depth was incomplete; CI also needed green baseline before continuing feature work.
- **Fix**: Added Temporal reconciliation schedule config/helpers (`HELM_TEMPORAL_RECONCILIATION_SCHEDULE_*`), reconciliation schedule status/ensure API hooks, Temporal workflow/activity/schedule bootstrap for `helmReconciliationWorkflow`, and fault-injection env guards (`HELM_RECONCILIATION_FAULT_INJECT`) that preserve no-blind-retry invariant (lookup errors keep receipts uncertain, no external re-execution). Added env-gated Temporal reconciliation e2e test scaffold.
- **Regression coverage**: `packages/shared` temporal tests PASS; `pnpm --filter @helm/shared typecheck`, `pnpm --filter @helm/api typecheck`, `pnpm --filter @helm/temporal-worker typecheck` PASS. Full workspace lint/typecheck/build/test PASS locally; GitHub Actions run `45438392752` PASS.
- **Audit/safety**: No blind retry of uncertain external writes; reconciliation remains lookup-first and DB-canonical; schedule management endpoint guarded by `HELM_ALLOW_DEV_AUTH=1`; fault-injection hooks are test-only env controls.
