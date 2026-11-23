# Personal Assistant Blueprint (Hermes + OpenFUSE + Reliable Execution)

## Purpose

This folder is an implementation-ready technical blueprint for building a **personal AI assistant from scratch** that combines:

- **Hermes-like intelligence/runtime** for planning, tool use, long-running work, memory, and delegation.
- **OpenFUSE-style UI/interaction** for chat, live task visibility, browser/computer workspace, approvals, receipts, and takeover.
- **BrowserOS-style deterministic browser capability** for repeatable web actions, with Playwright/CDP fallback.
- **Nanomuse-inspired architecture patterns** (researched, not copied) for device/agent boundaries, skill/connector separation, and inspectable control surfaces.
- **Temporal-like durable execution** for real-world tasks that must not silently fail, duplicate, or lose state.

This blueprint is grounded in local repository evidence:
- `Planning/OpenFUSE_Architecture_and_12_Document_Engineering_Blueprint.md`
- `Demo/openfuse/` (actual codebase: AG-UI runtime, Hono server, PGlite/Postgres store, task worker, browser worker, action approvals, computer service, domain schemas)
- `Research/openmuse/` (architecture/security/sentinel/model-contract/goals-tasks/memory/skills-connectors/roadmap docs)
- `Research/nanoMuse_real/` (`nano-muse/nanoMuse`, cloned for separate research; architecture, sentinel, hub, device, coding-agents, cloud docs and code)

## Product Goal

Build a personal assistant that can **execute real digital work end-to-end** across browser, apps, files, APIs, and local tools while keeping the user in control.

**User promise:** describe an outcome; the assistant plans, executes, shows evidence, asks for approval only when needed, recovers from failures, and delivers a receipt.

## Non-Negotiable Principles

1. **UI is not intelligence.** OpenFUSE-style product/control plane is separate from Hermes runtime.
2. **Model proposes, policy decides.** LLM output is untrusted until validated, authorized, and executed by trusted services.
3. **Durable state over chat transcripts.** Goals, tasks, steps, approvals, receipts, checkpoints, memory, and artifacts are persisted explicitly.
4. **One owner per execution surface.** Browser/desktop/session ownership is explicit; human takeover pauses automation.
5. **Deterministic where possible, agentic where needed.** Use recorded/playbook/browser deterministic flows for stable operations; use model planning for ambiguity.
6. **Idempotent external effects.** Emails, purchases, form submits, calendar writes, API mutations, and file publishes use idempotency keys and receipt verification.
7. **Least privilege and scoped secrets.** Secrets live in vault/broker; runtimes get references/surrogates, never raw reusable tokens by default.
8. **Inspectable and auditable.** Every meaningful action has a trace, event, policy decision, and outcome.
9. **Replaceable adapters.** Model providers, browser backends, connectors, sandboxes, and queue engines sit behind contracts.
10. **From-scratch buildability.** Every component below includes purpose, interfaces, schema, implementation steps, and acceptance criteria.

## Document Map

| File | Purpose |
|---|---|
| `00-README.md` | Index, principles, scope, source grounding. |
| `01-Product-Vision-and-Requirements.md` | Product definition, personas, jobs-to-be-done, MVP/v1/v2 scope, KPIs. |
| `02-System-Architecture.md` | Logical/component/deployment architecture, trust boundaries, data flow. |
| `03-Frontend-OpenFUSE-UI.md` | UI/UX blueprint, screens, components, state model, AG-UI/event rendering. |
| `04-Backend-Control-Plane.md` | API, services, task engine, event bus, storage, realtime, auth. |
| `05-Hermes-Agent-Runtime.md` | Hermes adapter contract, planning/execution loop, tools, delegation, memory integration. |
| `06-Deterministic-Browser-and-Computer-Execution.md` | BrowserOS/Playwright/CDP strategy, deterministic playbooks, computer use, takeover. |
| `07-Integrations-Apps-Models-Connectors.md` | MCP/native connectors, OAuth, app integrations, model/provider routing, BYOM/BYOA. |
| `08-Temporal-Reliable-Execution.md` | Durable workflows, retries, idempotency, compensation, recovery, scheduling. |
| `09-Security-Approvals-Privacy.md` | Threat model, Sentinel/policy engine, approvals, vault, sandboxing, audit. |
| `10-Data-Model-and-APIs.md` | Canonical schemas, event contracts, API endpoints, storage ownership. |
| `11-Implementation-Roadmap.md` | Phase-by-phase build plan, milestones, team/workstream sequencing, cutlines. |
| `12-Testing-Observability-and-Release.md` | Test strategy, evals, red-team cases, telemetry, SLOs, release gates. |
| `13-Repo-Structure-and-Stack.md` | Recommended monorepo layout, tech stack, dependencies, dev environment, CI/CD. |

## Key Design Decisions (Proposed)

| Decision | Choice | Why |
|---|---|---|
| Product shell | OpenFUSE-style web/desktop/mobile-ready UI | Proven interaction model in demo; user asked for OpenFUSE-like UI. |
| Intelligence runtime | Hermes primary, adapter-based | User asked for Hermes-like intelligence; keep replaceable. |
| Durable execution | Temporal workflow engine + app-level task state | User asked for Temporal-like real execution without fail; Temporal provides durable timers/retries/workflow state. |
| Browser automation | BrowserOS adapter for deterministic/browser-agent flows + Playwright worker fallback | User asked for BrowserOS deterministic capability; fallback preserves reliability. |
| Fast local deterministic actions | Recorded playbooks, selectors/ARIA snapshots, API-first connectors | Faster and more reliable than LLM-per-click. |
| Model strategy | BYOM: cloud + local, policy-routed | Privacy/cost/capability tradeoffs; OpenMuse contract pattern. |
| Data/control plane | Postgres + object store + Redis/NATS optional; local-first dev via PGlite acceptable | Demo uses PGlite/Postgres; durable production needs Postgres. |
| Security | Sentinel-style external policy + approval service + vault | OpenMuse/NanoMuse both separate authority from model; required for real actions. |

## Grounded Observations

### OpenFUSE demo (`Demo/openfuse`)
- Monorepo: `apps/mobile`, `apps/server`, `apps/worker`, `packages/domain|integrations|backends`.
- Server is Hono + AG-UI/CopilotKit runtime; built-in agent supports sample/model paths.
- Durable-ish task model in `packages/domain/src/agent.ts`: queued/running/waiting_approval/waiting_input/scheduled/paused/succeeded/failed/cancelled.
- `TaskWorker` uses DB lease/compare-and-swap/heartbeat for recovery and prevents duplicate active claims.
- `ActionService` prepares reviewed actions, binds hash/connection/target version, handles expiry, uncertain outcomes, and records activity.
- Browser worker is separate token-protected Playwright service with persistent profiles, screenshots, read/input/download endpoints.
- Computer service supports Docker/E2B desktop backends, bounded commands, workspace files, desktop actions.
- Docs state alpha, self-hosting, sample/live modes, local PGlite default, optional Postgres/external worker.

### OpenMuse research (`Research/openmuse`)
- Strong security invariant: runtime untrusted; credentials/egress/approval outside runtime.
- Clear model contract: provider-neutral normalized messages/tools/streaming/usage/routing.
- Durable goals/tasks/executions/schedules/events; restart-safe; idempotency for external writes.
- Sentinel: typed `ActionRequest -> ALLOW/DENY/ASK_USER`, grants, replay protection, fail-closed.
- Skills vs connectors separation: skills teach behavior; connectors hold privileged access.
- Roadmap favors vertical secure slices, not feature sprawl.

### NanoMuse research (`Research/nanoMuse_real`)
- Product shape: one agent across devices, inspectable memory/files, asks before irreversible actions.
- Sentinel gate in agent loop; approvals bound to capability/scope; audit trail.
- Hub/device model: devices as hands/doors with explicit remote-control permissions and routed approvals.
- Coding-agent/harness integration pattern: read/stream external agent sessions; explicit stop/resume semantics.
- Cloud/relay optionality: local-first possible, account/sync/relay are explicit components.

## Build Strategy

Build from scratch in **vertical slices** that each produce a user-visible, testable capability:

1. **Slice A - Chat + durable task skeleton**: UI shell, API, DB, task state machine, event stream.
2. **Slice B - Hermes runtime + tool router**: model adapter, planning loop, tool calls, audit.
3. **Slice C - Browser deterministic execution**: browser worker, playbooks, live view, takeover.
4. **Slice D - Approvals + connectors + vault**: Gmail/calendar/API actions, reviewed writes.
5. **Slice E - Temporal reliability**: workflow engine, retries/idempotency/compensation/schedules.
6. **Slice F - Memory + skills + personalization**: memory service, skill registry, proactive ideas.
7. **Slice G - Hardening + release**: security tests, evals, packaging, observability, backup/export.

## Out of Scope for MVP

- Unrestricted autonomous payments/account-security changes.
- Universal desktop app control guarantee.
- Multi-tenant enterprise admin.
- Self-modifying security/policy code.
- Fully autonomous background actions without policy constraints.
- Claiming "no failures" — target is **no silent failures, bounded retries, recoverable/visible outcomes**.

## How to Use This Blueprint

1. Read `01`-`03` for product/UI scope.
2. Read `04`-`10` for implementation contracts.
3. Execute `11` in order; do not skip reliability/security gates.
4. Use `12` as release criteria.
5. Create ADRs when deviating from proposed decisions.
