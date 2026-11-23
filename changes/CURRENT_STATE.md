# Current State â€” Helm

**Last updated:** 2026-11-23T11:41:00Z (session: WS session-token auth, P4 scaffolds, beyond 85%)
**Active phases:** Phase 1 UI/Task Core (`[~]`), Phase 3 Browser Execution (`[~]`), Phase 4 Approvals/Vault/Connectors (`[~]`)  
**Next move:** Add real session UX (login/logout/token storage) and remove dev-header dependence in web; implement encrypted vault provider + connector registry persistence; add Gmail/Calendar read-first connectors behind approvals. Keep live UI E2E evidence when browser automation surface is available.

## Project Identity
- **Name:** Helm (`@helm/*`)
- **Goal:** Personal AI operating assistant platform from scratch per blueprint: OpenFUSE-style control surface + Helm-native runtime + deterministic browser execution + reliability/security.
- **Blueprint:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\Personal_assistant\Planning\MASTER-TECHNICAL-BLUEPRINT.md`

## Current Status Snapshot

- **Overall:** ~86% complete (Phases 0-8 equal weight; usable prototype baseline).
- **Phase 0 - Foundation:** `[~]` 91%.
- **Phase 1 - UI/Task Core:** `[~]` 89%. Chat-first UI (message bubbles, live streaming assistant delta, Enter-to-send, follow-up messages on same task, tool-call/result cards from runtime/browser events), task list/control, SSE timeline, approvals, WS screencast preview with polling fallback, takeover controls + takeover-only click/type/Enter input, evidence/receipts panel. Task create idempotency metadata persisted on initial message (`c55dc2e`); follow-up rejects cancelled tasks with INVALID_TRANSITION (`d2a83fa`); regression covered by `tests/integration/src/task-lifecycle-api.test.ts` (PASS 2026-11-23). Dev web runs at `http://localhost:5173`.
- **Phase 2 - Agent Runtime:** `[~]` 56%. Local Ollama streaming + basic tool-calling loop; guardrails/allowlist/timeout/max_tokens/redaction; browser-intent gating; smoke PASS. Pending: richer tool registry/policy, provider/model selection UI, proper thread abstraction.
- **Phase 3 - Browser Execution:** `[~]` 93%. Guarded browser actions require owned session and approval-task/session-task binding; takeover request/resume require owned session and are idempotent; WS authz covers cross-user denial and now accepts bearer session-token owner auth (`2c9b419`, WS authz PASS); owned stream-status endpoint exposed with audit. Stale-session restart recovery + env-gated restart recovery integration PASS. Pending: real session/OIDC UX, WS stability/interactive-input live smoke, richer remote control.
- **Phase 4 - Approvals/Vault/Connectors:** `[~]` 59%. Approval flow, `action_receipts`, guarded browser routes, approval resolve ownership/actionHash/dedupe/conflict/CAS/approved receipt insertion. Session-token scaffold (`7ab4e5b`, PASS) and WS upgrade auth resolver (`2c9b419`). Shared P4 scaffold: `CredentialBroker`/vault secret ref + connector definition/account contracts (`39198a8`). Legacy unbound browser sessions hard-blocked with explicit owned-task rebind endpoint + audit/event + integration PASS (`1e29e7b`). Pending: real session/OIDC auth UX, encrypted vault provider, connector registry/OAuth, Gmail/Calendar, uncertain-outcome reconciliation.
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
































