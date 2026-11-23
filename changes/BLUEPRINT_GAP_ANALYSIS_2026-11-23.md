# Blueprint Gap Analysis - 2026-11-23

## Sources
- Blueprint: `helm/Planning/MASTER-TECHNICAL-BLUEPRINT.md` (00-13)
- Current state: `helm/changes/CURRENT_STATE.md`
- Evidence: typechecks/tests/smokes recorded in session logs and prior smokes

## Phase / Requirement Status

| Blueprint area | Status | Evidence (current repo) | Key gaps | Next action |
|---|---|---|---|---|
| P0 Foundation / repo/contracts/dev | **Mostly done** | pnpm/turbo monorepo, Docker Postgres/Redis, Drizzle schema, shared Zod contracts, tsconfig paths, env examples | CI remote evidence, tsx watch stability, dist/src tsconfig cleanup, ESLint-depth lint | stabilize dev/build ergonomics; verify CI |
| P1 OpenFUSE-style UI + task core | **In progress** | Chat-first UI, task list/control, SSE timeline, approvals, evidence/receipts, WS browser preview/fallback, takeover controls | Thread/conversation model, richer inline cards, activity/approval centers, reconnect cursor resume proof, WS event optionality decision | add thread model + UI polish; prove SSE reconnect E2E |
| P2 Hermes/runtime + model routing | **Partial** | HelmNativeRuntime, OpenAI-compatible stream, basic tool-calling (navigate/snapshot/click), persona+recent message context, Ollama E2E simple task PASS | Real Hermes adapter contract, model router/policy, provider/model selection UI, robust tool schema for small models, interrupt/resume/checkpoint, evals | add model/provider selection + tool-capability guardrails; define Hermes adapter boundary |
| P3 Browser execution + takeover | **In progress** | Playwright browser-worker, CDP screencast, WS proxy, takeover-only input, session metadata/storageState restore, artifacts, guarded external-action | Full crash recovery/reconnect, navigate risk policy, richer remote control, playbook runner, BrowserOS adapter, downloads/network evidence | harden recovery + classify navigate/observe actions; add playbook contract |
| P4 Approvals/vault/connectors | **Partial** | Approval list/resolve, action receipts, approval+actionHash+idempotency guards on click/fill/external-action, worker receipt hardening | Vault/credential broker, connector registry/OAuth, Gmail/Calendar, uncertain outcome reconciliation, complete binding audit for all side-effect paths | complete side-effect binding audit; design vault/connector contracts before impl |
| P5 Temporal reliability | **Not started** | DB lease worker + idempotency receipts/action hashes | Temporal workflows/signals/queries, reconciliation workflow, schedules/monitors, retry policies by action class | design minimal Temporal slice for long-running/high-risk actions |
| P6 BrowserOS deterministic upgrade | **Not started** | Playwright adapter only | BrowserOS adapter, capability detection/fallback, recorder/import, benchmarks | ADR after P3 hardening |
| P7 Memory/skills/proactivity | **Not started** | task_messages persisted; no memory/skill/proactivity subsystems | Memory CRUD/provenance/sensitivity, skill registry/versioning, monitors/ideas, notifications | schema/contracts first; no autonomous background actions before policy |
| P8 Hardening/release | **Not started** | basic typecheck/test/smoke evidence; redaction baseline | security suite, SSRF/egress, secret redaction verification, chaos/recovery, backup/export, observability/SLOs, runbooks, packaging | create release gate checklist and automate smoke/security tests |

## Critical Gaps (must close before “real execution” claim)
1. **Complete side-effect binding audit** - every mutating/browser/external path must require approval+actionHash+idempotency+receipt/audit; no bypass routes.
2. **Session recovery/reconnect contract** - in-memory browser sessions currently restored best-effort; define deterministic recreate/reconnect/failure states.
3. **Model tool-calling reliability** - small models leak tool schema/refuse; add model capability policy/guardrails and provider/model selection.
4. **Vault/secret boundary** - no vault/broker; tokens/secrets must never reach runtime/logs/events.
5. **Temporal/reconciliation** - uncertain external writes lack reconcile workflow; retries must be class-aware.
6. **Security/compliance evidence** - prompt injection/SSRF/redaction/chaos tests, retention/privacy, provenance/submission IP text.

## Recommended Next 3 Slices
1. **Binding audit + policy matrix**: enumerate every mutating endpoint/tool; add regression tests for 403/409/dedupe; classify navigate/screenshot/snapshot/input risk.
2. **Model/provider hardening**: UI/env model selection, tool-capable model allowlist/warning, full E2E chat+browser smoke with selected Ollama/cloud model.
3. **Vault/connector contract slice**: implement credential refs + connector manifest/registry skeleton (no live OAuth yet), then Gmail/Calendar behind approval+receipts.

## Acceptance for next session
- [ ] Binding audit doc lists every side-effect path and status.
- [ ] Regression tests cover guarded browser actions and dedupe/conflict.
- [ ] Model selection configured and E2E smoke recorded.
- [ ] CURRENT_STATE/SESSION_LOG updated with evidence.
