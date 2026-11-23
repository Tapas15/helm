# Current State â€” Helm

**Last updated:** 2026-11-23T12:05:00Z (session: SSE/control regression coverage, beyond 86%)
**Active phases:** Phase 1 UI/Task Core (`[~]`), Phase 3 Browser Execution (`[~]`), Phase 4 Approvals/Vault/Connectors (`[~]`)  
**Next move:** Real session/OIDC UX and web token flow; encrypted vault provider + connector registry persistence/OAuth/Gmail/Calendar/reconciliation. Keep live UI E2E evidence when browser automation surface is available.

## Project Identity
- **Name:** Helm (`@helm/*`)
- **Goal:** Personal AI operating assistant platform from scratch per blueprint: OpenFUSE-style control surface + Helm-native runtime + deterministic browser execution + reliability/security.
- **Blueprint:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\Personal_assistant\Planning\MASTER-TECHNICAL-BLUEPRINT.md`

## Current Status Snapshot

- **Overall:** ~87% complete (Phases 0-8 equal weight; usable prototype baseline).
- **Phase 0 - Foundation:** `[~]` 91%.
- **Phase 1 - UI/Task Core:** `[~]` 90%. Chat-first UI, SSE timeline, approvals/evidence/receipts, WS preview + polling fallback, takeover controls, idempotency/follow-up guards. Added SSE stream regression (`events-sse-api` PASS 3/3, includes cursor resume + invalid cursor validation) and invalid control transition regression (`task-lifecycle-api` PASS 3/3). Dev web `http://localhost:5173`.
- **Phase 2 - Agent Runtime:** `[~]` 56%. Local Ollama streaming + basic tool-calling loop; guardrails/allowlist/timeout/max_tokens/redaction; browser-intent gating; smoke PASS. Pending: richer tool registry/policy, provider/model selection UI, proper thread abstraction.
- **Phase 3 - Browser Execution:** `[~]` 93%. Guarded ownership/authz, takeover, stale-session restart recovery + direct and API-observable integration coverage, WS bearer session-token authz. Pending: real session/OIDC UX, WS stability/interactive-input live smoke, richer remote control.
- **Phase 4 - Approvals/Vault/Connectors:** `[~]` 59%. Approval/receipts hardened; session-token scaffold + WS resolver; vault/connector contracts scaffolded; legacy unbound browser sessions hard-blocked with explicit rebind. Pending: real session/OIDC UX, encrypted vault provider, connector registry/OAuth, Gmail/Calendar, uncertain-outcome reconciliation.
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
- [~] Live preview: WS screencast stream + takeover-only remote input implemented (typecheck/test PASS; live stack smoke pending).`n- [~] Clean restart/recovery: persisted task/event/approval/receipt/artifact state survives restart; browser-worker restart recovery has direct+API-observable integration coverage; in-memory live WS continuity still pending.
































