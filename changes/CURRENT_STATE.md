# Current State â€” Helm

**Last updated:** 2026-11-23T10:43:00Z (session: changes traceability audit, smoke check, live E2E prep)
**Active phases:** Phase 1 UI/Task Core (`[~]`), Phase 3 Browser Execution (`[~]`), Phase 4 Approvals/Vault/Connectors (`[~]`)  
**Next move:** Complete live UI E2E smoke at `http://localhost:5173` (chat stream/tool cards, browser high-risk approval approve/reject, receipts/evidence/browser preview). Then add regression tests for cancelled follow-up 409 and task-create idempotency metadata; continue browser crash/reconnect deterministic recovery contract and real auth/session/OIDC prep. See `changes/PLANNING_MISSING_ITEMS.md`, `changes/DESIGN-self-improvement-loop.md`, `changes/DESIGN-premium-white-ui.md`.

## Project Identity
- **Name:** Helm (`@helm/*`)
- **Goal:** Personal AI operating assistant platform from scratch per blueprint: OpenFUSE-style control surface + Helm-native runtime + deterministic browser execution + reliability/security.
- **Blueprint:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\Personal_assistant\Planning\MASTER-TECHNICAL-BLUEPRINT.md`

## Current Status Snapshot

- **Overall:** ~84% complete (Phases 0-8 equal weight; usable prototype baseline).
- **Phase 0 - Foundation:** `[~]` 90%.
- **Phase 1 - UI/Task Core:** `[~]` 89%. Chat-first UI (message bubbles, live streaming assistant delta, Enter-to-send, follow-up messages on same task, tool-call/result cards from runtime/browser events), task list/control, SSE timeline, approvals, WS screencast preview with polling fallback, takeover controls + takeover-only click/type/Enter input, evidence/receipts panel. Task create idempotency metadata persisted on initial message (`c55dc2e`); follow-up now rejects cancelled tasks with INVALID_TRANSITION (`d2a83fa`, regression test TODO). Dev web runs at `http://localhost:5173` (vite config); prior 5174 refs are stale.
- **Phase 2 - Agent Runtime:** `[~]` 56%. Helm-native runtime; normalized `runtime.*`; OpenAI-compatible streaming adapter; basic model tool-calling loop (browser navigate/snapshot/click, guarded click approval/hash/idempotency) with local-first Ollama guardrails (`HELM_MODEL_TIMEOUT_MS`, `HELM_MODEL_MAX_TOKENS`, `HELM_MODEL_TOOL_CAPABLE_ALLOWLIST`, redacted model errors, no invented click approval fields). `llama3.2:latest`/`qwen2.5:latest` tool probes PASS; `qwen3.5:latest`/`qwen3:4b` timed out in 90s probe. E2E smokes PASS: assistant `task_92146b100cc04f04b601b15e92e4cf99` (`HELM_OK`); browser high-risk `task_d43b586c851f4106be09c31d0a711715` -> waiting_approval -> approved -> guarded `browser.external_action.executed` -> receipt `rcpt_7ab4a67007bc44de801aed8d2b433075` executed. Latest API smoke: `task_6b922aee05304cfbb81c986ba5d960d4` -> `HELM_SMOKE_OK` on running stack. Pending: live UI E2E smoke, richer tool registry/policy, provider/model selection UI, proper thread abstraction.
- **Phase 3 - Browser Execution:** `[~]` 91%. Guarded browser actions require owned session and approval-task/session-task binding; takeover request/resume require owned session and are idempotent; WS authz integration covers cross-user denial; owned stream-status endpoint exposed with audit. Integration coverage expanded for ownership (get/screenshot.png/snapshot/close, takeover request/resume, stream status response shape); takeover ownership test tightened (`0a3db45`). Pending: real session/OIDC auth, WS stability/interactive-input live smoke, deterministic recreate/reconnect contract, richer remote control, crash recovery.
- **Phase 4 - Approvals/Vault/Connectors:** `[~]` 57%. Approval flow, `action_receipts`, guarded browser routes, approval resolve ownership/actionHash/dedupe/conflict/CAS/approved receipt insertion. Approvals list supports `taskId` filter; integration coverage includes resolve invariants, guarded navigate dedupe, guarded approval-task binding mismatch. API auth has `HELM_REQUIRE_AUTH=1` strict-header mode (dev fallback preserved by default) to prepare real auth migration. Pending: real session/OIDC auth, vault/policy boundaries, connector registry/OAuth, Gmail/Calendar, uncertain-outcome reconciliation.
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
































