# Current State â€” Helm

**Last updated:** 2026-11-23T11:23:00Z (session: browser restart recovery integration coverage)
**Active phases:** Phase 1 UI/Task Core (`[~]`), Phase 3 Browser Execution (`[~]`), Phase 4 Approvals/Vault/Connectors (`[~]`)  
**Next move:** Real auth/session/OIDC prep replacing dev `x-user-id` (API+WS) with regression coverage; define legacy unbound browser session migration/rebind policy; continue live UI E2E when browser automation surface is available. See `changes/PLANNING_MISSING_ITEMS.md`, `changes/DESIGN-self-improvement-loop.md`, `changes/DESIGN-premium-white-ui.md`.

## Project Identity
- **Name:** Helm (`@helm/*`)
- **Goal:** Personal AI operating assistant platform from scratch per blueprint: OpenFUSE-style control surface + Helm-native runtime + deterministic browser execution + reliability/security.
- **Blueprint:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\Personal_assistant\Planning\MASTER-TECHNICAL-BLUEPRINT.md`

## Current Status Snapshot

- **Overall:** ~85% complete (Phases 0-8 equal weight; usable prototype baseline).
- **Phase 0 - Foundation:** `[~]` 90%.
- **Phase 1 - UI/Task Core:** `[~]` 89%. Chat-first UI (message bubbles, live streaming assistant delta, Enter-to-send, follow-up messages on same task, tool-call/result cards from runtime/browser events), task list/control, SSE timeline, approvals, WS screencast preview with polling fallback, takeover controls + takeover-only click/type/Enter input, evidence/receipts panel. Task create idempotency metadata persisted on initial message (`c55dc2e`); follow-up rejects cancelled tasks with INVALID_TRANSITION (`d2a83fa`); regression covered by `tests/integration/src/task-lifecycle-api.test.ts` (PASS 2026-11-23). Dev web runs at `http://localhost:5173` (vite config); prior 5174 refs are stale.
- **Phase 2 - Agent Runtime:** `[~]` 56%. Helm-native runtime; normalized `runtime.*`; OpenAI-compatible streaming adapter; basic model tool-calling loop (browser navigate/snapshot/click, guarded click approval/hash/idempotency) with local-first Ollama guardrails (`HELM_MODEL_TIMEOUT_MS`, `HELM_MODEL_MAX_TOKENS`, `HELM_MODEL_TOOL_CAPABLE_ALLOWLIST`, redacted model errors, no invented click approval fields). `llama3.2:latest`/`qwen2.5:latest` tool probes PASS; `qwen3.5:latest`/`qwen3:4b` timed out in 90s probe. E2E smokes PASS: assistant `task_92146b100cc04f04b601b15e92e4cf99` (`HELM_OK`); browser high-risk `task_d43b586c851f4106be09c31d0a711715` -> waiting_approval -> approved -> guarded `browser.external_action.executed` -> receipt `rcpt_7ab4a67007bc44de801aed8d2b433075` executed. Latest API smoke: `task_6b922aee05304cfbb81c986ba5d960d4` -> `HELM_SMOKE_OK` on running stack. Pending: live UI E2E smoke, richer tool registry/policy, provider/model selection UI, proper thread abstraction.
- **Phase 3 - Browser Execution:** `[~]` 93%. Guarded browser actions require owned session and approval-task/session-task binding; takeover request/resume require owned session and are idempotent; WS authz integration covers cross-user denial; owned stream-status endpoint exposed with audit. Integration coverage expanded for ownership (get/screenshot.png/snapshot/close, takeover request/resume, stream status response shape); takeover ownership test tightened (`0a3db45`). Browser-worker stale session recovery (`4045ce3`) plus env-gated restart recovery integration test (`4ad4820`, `HELM_BROWSER_RECOVERY_TEST=1` PASS 1/1) covers worker restart -> restored session -> navigate/screenshot. Pending: real session/OIDC auth, WS stability/interactive-input live smoke, richer remote control, legacy unbound session migration/rebind policy.
- **Phase 4 - Approvals/Vault/Connectors:** `[~]` 58%. Approval flow, `action_receipts`, guarded browser routes, approval resolve ownership/actionHash/dedupe/conflict/CAS/approved receipt insertion. Approvals list supports `taskId` filter; integration coverage includes resolve invariants, guarded navigate dedupe, guarded approval-task binding mismatch. API auth has session-token scaffold (`POST /v1/auth/sessions`, `GET /v1/auth/me`, revoke, bearer auth middleware; integration PASS 1/1) plus dev `x-user-id` fallback for local parity. Shared P4 scaffold added: `CredentialBroker`/vault secret ref contracts and connector registry/account contracts (`packages/shared/src/connectors.ts`, `changes/P4_SCAFFOLD_2026-11-23.md`). Legacy unbound browser sessions hard-blocked with explicit owned-task rebind endpoint + audit/event + integration PASS 1/1. Pending: real session/OIDC auth, encrypted vault provider, connector registry/OAuth, Gmail/Calendar, uncertain-outcome reconciliation.
- **Phase 5-8:** `[ ]` 0-5%.


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
- [~] Live preview: WS screencast stream + takeover-only remote input implemented (typecheck/test PASS; live stack smoke pending).`n- [~] Clean restart/recovery: persisted task/event/approval/receipt/artifact state survives restart; in-memory browser sessions do not.
































