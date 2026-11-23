# Current State â€” Helm

**Last updated:** 2026-11-23T07:05:00Z (session: navigate guard integration, DX cleanup, progress sync)
**Active phases:** Phase 1 UI/Task Core (`[~]`), Phase 3 Browser Execution (`[~]`), Phase 4 Approvals/Vault/Connectors (`[~]`)  
**Next move:** Complete binding audit remaining gaps (approval resolve idempotency/conflict, session ownership/audit for screenshot/snapshot/close/create), add regression tests for navigate guard and approval replay, then continue browser recovery hardening. See `changes/PLANNING_MISSING_ITEMS.md` for full blueprint-parity checklist, `changes/DESIGN-self-improvement-loop.md` for proposed self-improvement design, and `changes/DESIGN-premium-white-ui.md` for the premium white UI design system plan.

## Project Identity
- **Name:** Helm (`@helm/*`)
- **Goal:** Personal AI operating assistant platform from scratch per blueprint: OpenFUSE-style control surface + Helm-native runtime + deterministic browser execution + reliability/security.
- **Blueprint:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\Personal_assistant\Planning\MASTER-TECHNICAL-BLUEPRINT.md`

## Current Status Snapshot

- **Overall:** ~70% complete (Phases 0-8 equal weight; usable prototype baseline).
- **Phase 0 - Foundation:** `[~]` 90%.
- **Phase 1 - UI/Task Core:** `[~]` 87%. Chat-first UI (message bubbles, live streaming assistant delta, Enter-to-send, follow-up messages on same task, tool-call/result cards from runtime/browser events), task list/control, SSE timeline, approvals, WS screencast preview with polling fallback, takeover controls + takeover-only click/type/Enter input, evidence/receipts panel.
- **Phase 2 - Agent Runtime:** `[~]` 56%. Helm-native runtime; normalized `runtime.*`; OpenAI-compatible streaming adapter; basic model tool-calling loop (browser navigate/snapshot/click, guarded click approval/hash/idempotency) with local-first Ollama guardrails (`HELM_MODEL_TIMEOUT_MS`, `HELM_MODEL_MAX_TOKENS`, `HELM_MODEL_TOOL_CAPABLE_ALLOWLIST`, redacted model errors, no invented click approval fields). `llama3.2:latest`/`qwen2.5:latest` tool probes PASS; `qwen3.5:latest`/`qwen3:4b` timed out in 90s probe. E2E smokes PASS: assistant `task_92146b100cc04f04b601b15e92e4cf99` (`HELM_OK`); browser high-risk `task_d43b586c851f4106be09c31d0a711715` -> waiting_approval -> approved -> guarded `browser.external_action.executed` -> receipt `rcpt_7ab4a67007bc44de801aed8d2b433075` executed. Pending: live UI E2E smoke, richer tool registry/policy, provider/model selection UI, proper thread abstraction.
- **Phase 3 - Browser Execution:** `[~]` 80%. Playwright browser-worker smoke pass; CDP screencast WS + API proxy with ownership check before proxy; takeover-only remote input; 5m session TTL; DOM/screenshot artifacts; guarded external-action/click/fill/navigate(non-allowlisted) enforced; session list scoped to user-owned task/session IDs; get/screenshot/snapshot/close/navigate-low-risk require ownership + audit. API integration now covers navigate allowlist 403/allowlist 200/guarded dedupe path, browser ownership cross-user denial, approval resolve mismatch/dedupe/conflict. Pending: WS stability/interactive-input live smoke, real auth (replace dev userId query parity), deterministic recreate/reconnect contract, richer remote control, crash recovery.
- **Phase 4 - Approvals/Vault/Connectors:** `[~]` 54%. Approval flow, `action_receipts`, guarded browser routes, approval resolve ownership/actionHash/dedupe/conflict/CAS/approved receipt insertion. Integration coverage includes resolve invariants and guarded navigate dedupe. Pending: WS authz tests, vault/policy boundaries, connector registry/OAuth, Gmail/Calendar, uncertain-outcome reconciliation.
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


















