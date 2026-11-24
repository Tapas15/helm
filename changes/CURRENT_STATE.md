# Current State â€” Helm

**Last updated:** 2026-11-24T04:06:00Z (unblocked-only: reconciliation API proof PASS, identity policy PATCH)
**Active phases:** Phase 1 UI/Task Core (`[~]`), Phase 3 Browser Execution (`[~]`), Phase 4 Approvals/Vault/Connectors (`[~]`)  
**Next move:** Real session/OIDC UX and web token flow; encrypted vault provider + connector registry persistence/OAuth/Gmail/Calendar/reconciliation. Keep live UI E2E evidence when browser automation surface is available.

## Project Identity
- **Name:** Helm (`@helm/*`)
- **Goal:** Personal AI operating assistant platform from scratch per blueprint: OpenFUSE-style control surface + Helm-native runtime + deterministic browser execution + reliability/security.
- **Blueprint:** `C:\Users\Tapas\Documents\projects\Dubai_competetion_projects\Personal_assistant\Planning\MASTER-TECHNICAL-BLUEPRINT.md`

## Current Status Snapshot

- **Overall:** ~90% complete (Phases 0-8 equal weight; usable prototype baseline).
- **Phase 0 - Foundation:** `[~]` 91%.
- **Phase 1 - UI/Task Core:** `[~]` 91%. Chat-first UI, SSE timeline, approvals/evidence/receipts, WS preview + polling fallback, takeover controls, idempotency/follow-up guards. Added SSE stream regression (`events-sse-api` PASS 3/3, includes cursor resume + invalid cursor validation), invalid control transition regression (`task-lifecycle-api` PASS 4/4), and task-list limit validation. Web now has session-token sign-in/sign-out flow and sends bearer auth on fetch/SSE/WS/screenshot (dev `x-user-id` fallback only when `HELM_ALLOW_DEV_AUTH=1` and `HELM_REQUIRE_AUTH!=1`). Dev web `http://localhost:5173`.
- **Phase 2 - Agent Runtime:** `[~]` 56%. Local Ollama streaming + basic tool-calling loop; guardrails/allowlist/timeout/max_tokens/redaction; browser-intent gating; smoke PASS. Pending: richer tool registry/policy, provider/model selection UI, proper thread abstraction.
- **Phase 3 - Browser Execution:** `[~]` 93%. Guarded ownership/authz, takeover, stale-session restart recovery + direct and API-observable integration coverage, WS bearer session-token authz via shared resolver. Pending: real session/OIDC UX polish, WS stability/interactive-input live smoke, richer remote control.
- **Phase 4 - Approvals/Vault/Connectors:** `[~]` 88%. Approval/receipts hardened; auth session scaffold; local vault/CredentialBroker; Gmail read/send and Calendar read/create/update/delete approval-gated with actionHash+idempotency+receipts+uncertain reconcile; web connector UI. Pending: real Google OAuth E2E (external creds), diagnostics/sync UX, token refresh/revoke hardening against real provider.
- **Phase 5 - Temporal Reliability:** `[~]` 60%. ADR-002, compose profile healthy, shared flags, `@helm/temporal-worker` scaffold, guarded Gmail/Calendar/browser external-action activities, API feature-flag routing, stub integration PASS (`7497b0c`), real Temporal workflowId-dedupe E2E PASS (`528551c`), mock-provider side-effect E2E PASS (`1ecca7b`), runtime rollback E2E PASS (`1748e15`), runbook. Added DB-canonical uncertain-receipt reconciliation service + `/v1/reconciliation/status|run` + optional in-process scheduler (`HELM_RECONCILIATION_*`), no blind retry; lookup-first auto-reconcile records attempt metadata and only marks executed when provider lookup proves external ref. Pending: real provider no-duplicate proof (external sandbox), Temporal-native reconciliation schedules/monitors, fault-injection/operator depth.
- **Phase 6 - BrowserOS Adapter:** `[~]` 25%. Adapter interface + Playwright default + BrowserOS stub; adapter status endpoint, `HELM_BROWSER_ADAPTER_DISPATCH` flag, request/requestBinary dispatch, adapter-aware session lookup (`e5391c1`,`a91885a`,`9dc78e6`,`4bfc19c`). Pending: full typed route migration, real BrowserOS endpoint/protocol, parity/security tests.
- **Phase 7 - Memory/Skills/Proactivity:** `[~]` 40%. Identity contracts/status/list/create/policy read+PATCH (helm-owned default, delegated disabled), restrictive default policy with invariant (external writes cannot disable approval via policy PATCH), `identities/identity_policies/memory_notes/skills/proactivity_rules` schema, DB-backed notes/skills/proactivity rules behind flags, PATCH for skills/proactivity rules, memory note delete (`28f4c11`,`458dfcc`,`65eee27`,`bbe75cf`). Pending: identity vault linkage/policy enforcement in side-effect routes/UI, skill execution/proactivity scheduler; self-improvement activation requires explicit approval.
- **Phase 8 - Hardening/Compliance:** `[~]` 35%. Backup/restore scripts+runbooks+drill runbook, security/privacy checklist, release-evidence, threat-model and PII-retention baselines (`8004a5a`,`5c0a123`); CI now includes report-only dependency audit step (`pnpm audit --audit-level=high`, continue-on-error). Pending: drill execution evidence, security scan triage/gating, threat model execution, PII retention/export/delete implementation, compliance/provenance signoff.


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
































