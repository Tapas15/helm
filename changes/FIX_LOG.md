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

