# Personal Assistant - Master Technical Blueprint

> Consolidated from 14 blueprint documents. Generated 2026-11-22.

---


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



---


# 01 - Product Vision and Requirements

## 1. Product Definition

**Product name (working):** Personal Assistant Platform ("PAP")  
**One-liner:** A personal AI operating assistant with an OpenFUSE-style control surface, Hermes-like intelligence, deterministic browser/computer execution, and Temporal-grade reliability for real tasks.

## 2. Problem

Users can chat with AI, but real work fails in the gaps:
- Tasks span multiple apps/sites/accounts.
- Browser automation is brittle and opaque.
- Long-running tasks lose state on crashes/timeouts.
- Sensitive actions need approvals and receipts.
- Users cannot trust silent agent behavior.

## 3. Target Users

| Persona | Needs | Primary surfaces |
|---|---|---|
| Power individual | Automate research, forms, email, scheduling, files | Chat, Activity, Browser, Approvals |
| Founder/operator | Repeatable workflows across SaaS tools | Tasks, Integrations, Playbooks, Receipts |
| Technical self-hoster | Local control, BYOM, auditability, extensibility | Settings, Models, Connectors, Skills, Logs |

## 4. Jobs To Be Done

- "When I give a goal, keep working until done or clearly blocked."
- "Show me what you're doing in real time."
- "Ask before risky actions and execute exactly what I approved."
- "Handle browser/app work reliably, even if something crashes."
- "Remember my preferences and reuse proven workflows."
- "Let me take over the browser/computer at any moment."

## 5. Product Principles

- **Outcome-first:** user requests outcomes, not tool commands.
- **Visible execution:** every step has status, evidence, and logs.
- **Safe autonomy:** autonomy bounded by policy, scopes, and approvals.
- **Deterministic fast path:** prefer APIs/playbooks over fragile reasoning loops.
- **Durable by default:** no silent failure; every run recoverable or explainable.
- **User-owned data:** export/delete memory, artifacts, and audit history.

## 6. Scope

### MVP (Must Ship)

1. **OpenFUSE-style UI shell**
   - Chat, Tasks/Activity, Browser workspace, Approvals, Connections, Settings.
2. **Hermes runtime adapter**
   - Session create/send/stream/interrupt/resume/close.
   - Tool calling through policy-gated router.
3. **Durable task engine**
   - Task state machine, checkpoints, event log, restart recovery.
4. **Browser execution**
   - Playwright worker with persistent profile, screenshot/read/click/type/scroll/download.
   - Live preview and human takeover.
5. **Approval system**
   - Action preparation, exact-hash approval, expiry, deny/cancel, receipts.
6. **Connectors v1**
   - Gmail read/draft/send (send approval-gated), Google Calendar read/create/update (write approval-gated).
7. **Model routing v1**
   - At least one cloud provider + one local/OpenAI-compatible provider; policy-aware fallback.
8. **Audit & observability**
   - Correlated task/session/tool IDs, structured logs, redaction.

### V1 (Post-MVP)

- BrowserOS adapter (deterministic playbooks, CDP/extension bridge where supported).
- Temporal-backed workflows for long-running/retry-heavy jobs.
- Memory service (inspect/edit/delete/export, provenance, sensitivity).
- Skill registry (versioned, tested, permission-declared).
- Desktop computer workspace (Docker sandbox) with files/terminal.
- Proactive monitors/ideas with notification policy.

### V2

- Multi-device hub (phone/desktop/web) with explicit remote-control grants.
- Generated skills with sandboxed build/test/install pipeline.
- Rich artifact generation (reports, spreadsheets, dashboards).
- Local-first encrypted sync/export/import.
- Enterprise/team controls (optional, separate product line).

## 7. Functional Requirements

### FR-UI
- FR-UI-1: User can create a task from chat with one message.
- FR-UI-2: User can see plan, current step, tool activity, and errors in real time.
- FR-UI-3: User can open live browser/computer workspace for active task.
- FR-UI-4: User can pause, resume, cancel, retry, and take over.
- FR-UI-5: User can review exact approval payload before execution.
- FR-UI-6: User can inspect receipts/artifacts/history.

### FR-Runtime
- FR-RT-1: Hermes adapter normalizes model/tool events into app event schema.
- FR-RT-2: Runtime can request tools only through registered capability contracts.
- FR-RT-3: Runtime supports interruption and checkpoint resume.
- FR-RT-4: Runtime supports subtask delegation with bounded budgets.

### FR-Execution
- FR-EX-1: Browser actions execute in isolated worker/session.
- FR-EX-2: Deterministic playbooks run without LLM per step when selected.
- FR-EX-3: API connectors execute typed requests with schema validation.
- FR-EX-4: External side effects require idempotency keys.

### FR-Policy
- FR-POL-1: Every tool call evaluated by policy engine before execution.
- FR-POL-2: High-risk actions require explicit approval bound to action hash.
- FR-POL-3: Approval invalidated on target/args/account/amount change.
- FR-POL-4: Emergency stop cancels active runs and blocks new risky actions.

### FR-Data
- FR-DATA-1: Tasks/events/approvals/artifacts persisted with owner scope.
- FR-DATA-2: Secrets stored as references; plaintext never in logs.
- FR-DATA-3: Memory has provenance, sensitivity, edit/delete/export.

## 8. Non-Functional Requirements

| Category | Requirement | Target |
|---|---|---|
| Reliability | No silent failure; all terminal states explicit | 100% runs end in succeeded/failed/cancelled/waiting/blocked with reason |
| Durability | Task state survives process restart | Resume/continue or clear failure within RTO < 60s |
| Idempotency | No duplicate external side effect on retry | 0 duplicate sends/writes in tested scenarios |
| Latency | UI event stream first token/step | < 2s first event for interactive tasks |
| Security | Unauthorized tool execution | 0 in policy tests |
| Auditability | Trace coverage for sensitive actions | 100% sensitive actions audited |
| Portability | Replace model/browser/connector | Adapter contract tests pass |
| Usability | Takeover/approval clarity | User can identify exact action and state |

## 9. Key User Flows

### Flow A: Research and summarize (low risk)
1. User asks for web research.
2. Runtime creates plan and browser task.
3. Deterministic browser read/screenshot/playbook collects evidence.
4. UI shows sources/cards; task completes with artifact.

### Flow B: Draft and send email (high risk write)
1. User asks to draft reply.
2. Connector reads thread (read-scoped).
3. Assistant prepares draft; UI shows diff/preview.
4. User approves exact send action.
5. Action executes with idempotency key; receipt stored.

### Flow C: Form fill with takeover
1. User asks to complete web form.
2. Browser playbook fills known fields.
3. Unknown/sensitive field triggers `waiting_input` or takeover.
4. User takes control, returns control.
5. Agent validates and submits only after approval if required.

### Flow D: Long-running monitor (durable schedule)
1. User creates monitor/goal.
2. Temporal schedule triggers checks.
3. Deduped observations create notifications only on material change.
4. Failures backoff; state persists across restarts.

## 10. Success Metrics

| Metric | Definition | MVP target |
|---|---|---|
| Task success rate | Tasks meeting acceptance criteria | > 75% on scoped benchmark suite |
| Verified completion rate | Completed with evidence/receipt | > 90% of succeeded tasks |
| Approval correctness | Approved action executed exactly as reviewed | 100% |
| Duplicate side-effect rate | Duplicate external writes/messages | 0 in release suite |
| Recovery rate | Recoverable failures resumed/cleanly failed | > 95% |
| Time to first useful signal | User sees plan/progress | < 3s median |
| Human takeover success | User can take/return control without corruption | > 99% |

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Browser flakiness | Failed tasks/user distrust | Deterministic playbooks, selectors+ARIA, retries, screenshots, fallback backend |
| Prompt injection | Unauthorized actions/data leak | Untrusted content labeling, policy engine outside model, egress controls, approval binding |
| Duplicate external actions | Real-world harm | Idempotency keys, action receipts, provider dedupe, uncertain-state handling |
| Runtime/model outage | Stalled work | Fallback model policy, Temporal retries, paused/blocked states |
| Secret leakage | Account compromise | Vault references, redaction, no secrets in prompts/logs |
| Over-automation | Unsafe behavior | Risk tiers, approval defaults, emergency stop, audit |

## 12. MVP Acceptance Scenarios

1. User sends prompt; receives streamed plan and response.
2. Agent browses public site in visible session and returns cited evidence.
3. User pauses task, takes over browser, returns control; task resumes.
4. Agent drafts email but cannot send without approval.
5. Approved send creates receipt; changing recipient invalidates approval.
6. Connector disconnect immediately removes tool availability.
7. Cancel stops further actions after acknowledgement.
8. Process restart recovers task history and checkpoint state.
9. Browser crash yields recoverable retry or clear partial-completion report.
10. Malicious page text cannot override policy/approval rules.
11. Repeated execution does not duplicate external side effect.
12. Local model and cloud model both run same task through same contracts.



---


# 02 - System Architecture

## 1. Architecture Goals

- Separate **product UX**, **agent intelligence**, **execution**, **policy**, and **durable state**.
- Support **real task execution** with visible progress, approvals, takeover, and receipts.
- Make external effects **idempotent, auditable, and recoverable**.
- Allow swapping Hermes/model/browser/connector implementations without redesign.

## 2. High-Level Logical Architecture

```mermaid
flowchart TB
  U[User: Web/Desktop/Mobile] --> UI[OpenFUSE-style UI\nChat/Tasks/Browser/Approvals/Settings]

  UI -->|HTTPS/WSS| API[API Gateway / BFF\nAuth, Session, Realtime]
  API --> CP[Control Plane Services]
  API --> ES[Event Stream / WS]

  subgraph CP[Control Plane]
    TASK[Task Service\nstate machine, checkpoints]
    PLAN[Plan/Orchestrator Service]
    POL[Policy & Approval Service\nSentinel]
    CONN[Connector Registry\nOAuth/scopes/health]
    MEM[Memory Service\nprovenance/sensitivity]
    ART[Artifact Service\nfiles/receipts/reports]
    AUD[Audit Service]
  end

  PLAN --> HERMES[Hermes Runtime Adapter]
  HERMES --> ROUTER[Model Router\nBYOM policy]
  ROUTER --> CLOUD[Cloud Models]
  ROUTER --> LOCAL[Local/OpenAI-compatible Models]

  HERMES --> TOOL[Tool Router / Capability Gateway]
  TOOL --> POL
  POL -->|ALLOW/ASK/DENY| TOOL

  TOOL --> BROWSER[Browser Execution Service\nBrowserOS/Playwright adapters]
  TOOL --> COMPUTER[Computer Execution Service\nDocker/E2B sandbox]
  TOOL --> CWORKER[Connector Workers\nGmail/Calendar/API/MCP]
  TOOL --> SKILL[Skill Runner\nversioned playbooks/scripts]

  BROWSER --> BV[Live View / Screenshot / DOM Snapshot]
  COMPUTER --> CV[Terminal / Files / Desktop stream]

  subgraph DATA[Data Plane]
    PG[(Postgres\nusers/tasks/events/approvals/memory metadata/audit)]
    OBJ[(Object Store\nartifacts/screenshots/files/exports)]
    REDIS[(Redis/NATS optional\ncache/queues/pubsub)]
    VAULT[(Secret Vault/KMS\ncredential refs/encryption keys)]
  end

  CP --> PG
  CP --> OBJ
  CP --> REDIS
  POL --> VAULT
  CWORKER --> VAULT
  BROWSER --> OBJ
  COMPUTER --> OBJ

  subgraph DURABLE[Durable Execution Layer]
    TEMP[Temporal Cluster\nWorkflows/Activities/Schedules]
  end

  PLAN --> TEMP
  TEMP --> TOOL
  TEMP --> TASK

  ES --> UI
  TASK --> ES
  POL --> ES
  BROWSER --> ES
  COMPUTER --> ES
```

## 3. Trust Boundaries

```mermaid
flowchart LR
  subgraph T1[Trusted Client Boundary]
    UI[User UI]
  end
  subgraph T2[Trusted Control Plane]
    API[API/Auth]
    TASK[Task/Policy/Audit]
    VAULT[Vault Broker]
  end
  subgraph T3[Untrusted/Constrained Execution]
    HERMES[Hermes Runtime]
    BROWSER[Browser Worker]
    COMPUTER[Sandbox/Computer]
    SKILL[Skill Runtime]
  end
  subgraph T4[External Systems]
    MODELS[Model Providers]
    SAAS[Google/APIs/MCP/Websites]
  end

  UI <--> API
  API <--> TASK
  TASK <--> HERMES
  HERMES <--> MODELS
  HERMES -->|tool proposals| TASK
  TASK -->|authorized calls| BROWSER
  TASK -->|authorized calls| COMPUTER
  TASK -->|authorized calls| SKILL
  BROWSER <--> SAAS
  COMPUTER <--> SAAS
  TASK <--> VAULT
```

**Boundary rules:**
- Runtime never receives raw vault secrets.
- Runtime cannot approve itself; approvals are signed/persisted by policy service.
- Browser/computer workers execute only authorized, scoped commands.
- External web/content is untrusted input; never system instructions.

## 4. Component Responsibilities

| Component | Responsibilities | Must not do |
|---|---|---|
| UI (OpenFUSE-style) | Chat, task timeline, live workspace, approvals, settings | Direct secret access, direct privileged execution |
| API/BFF | AuthN/AuthZ, request validation, realtime fanout, rate limits | Business logic bypassing policy |
| Task Service | Task lifecycle, checkpoints, leases, retry metadata | Execute unapproved external writes |
| Hermes Adapter | Session lifecycle, prompt/tool orchestration, event normalization | Persist authoritative business state only in memory |
| Model Router | Provider selection, capability/sensitivity routing, fallback | Fallback to disallowed data region/provider |
| Policy/Sentinel | Risk classification, approval decisions, grant validation | Allow model-generated "approval" text |
| Browser Service | Session isolation, deterministic actions, screenshots, takeover | Unscoped arbitrary host control |
| Computer Service | Sandboxed command/file execution, artifacts | Host escape, credential exfiltration |
| Connector Workers | Typed API/MCP calls, token broker integration, retries | Raw token exposure to runtime |
| Temporal | Durable workflows, timers, schedules, retries, compensation | Replace product policy/audit source of truth |
| Audit/Telemetry | Immutable audit events, traces, metrics, redaction | Store secrets/PII in plaintext |

## 5. Execution Model: Hybrid "Agentic + Deterministic + Durable"

| Layer | Use when | Technology |
|---|---|---|
| Agentic planning | Ambiguous goals, multi-step reasoning, summarization | Hermes + model router |
| Deterministic execution | Known workflow/UI/API sequence | Playbooks, BrowserOS scripts, typed connector actions |
| Durable orchestration | Long-running, retry-prone, external side effects | Temporal workflows/activities |

**Rule:** LLM decides *what* and *when* among allowed capabilities; deterministic/durable layers decide *how reliably*.

## 6. Core Request Lifecycle

```mermaid
sequenceDiagram
  autonumber
  participant User
  participant UI
  participant API
  participant Task
  participant Hermes
  participant Policy
  participant Exec as Browser/Connector/Computer
  participant DB

  User->>UI: "Book dentist appointment / send email / fill form"
  UI->>API: Create task
  API->>Task: Persist task(created/queued)
  Task->>Hermes: Start session with scoped context
  Hermes->>Task: Plan + tool proposal events
  Task->>UI: Stream plan/progress
  Hermes->>Policy: Tool request (typed)
  alt Needs approval
    Policy->>Task: ASK_USER + approval object
    Task->>UI: Render exact approval card
    User->>UI: Approve/Deny
    UI->>Policy: Decision
  end
  Policy->>Exec: Authorized execution (ALLOW)
  Exec->>Task: Result + artifacts + evidence
  Task->>DB: Checkpoint + receipts + audit refs
  Task->>UI: Completed/blocked/failed with explanation
```

## 7. Deployment Architecture

### Dev (single machine)
- `apps/web`, `apps/api`, `apps/worker`, `apps/browser-worker`, optional `temporal-dev`.
- Postgres (or PGlite for local quickstart), local object store dir, local vault/mock vault.
- Docker for sandbox/browser isolation.

### Production (self-hosted/single tenant first)
- API/BFF behind reverse proxy (TLS).
- Control plane workers horizontally scalable.
- Temporal cluster (separate DB).
- Postgres HA, object store (S3-compatible), Redis/NATS.
- Vault/KMS (HashiCorp Vault, cloud KMS, or OS keychain for desktop-local mode).
- OTel collector + log/metrics/traces backend.

## 8. OpenFUSE Compatibility Mapping

| OpenFUSE concept | Blueprint implementation |
|---|---|
| Chat + task activity | UI `ChatPane`, `TaskTimeline`, AG-UI normalized events |
| Live browser workspace | Browser session service + embedded preview/takeover |
| Action proposals/approvals | `ActionProposal` + policy hash binding + receipts |
| Agent computer | Sandbox computer service (terminal/files/desktop) |
| Rich threads | CopilotKit/AG-UI compatible event model; thread persistence adapter |
| Task worker leases | DB compare-and-swap leases now; Temporal activities later |

## 9. NanoMuse-Inspired Patterns (Adopted Selectively)

- **Per-surface agent/session ownership:** no ambiguous control; explicit handoff.
- **Device/hub concept for future:** web/desktop/mobile as clients of same account/control plane.
- **Inspectability:** memory/permissions/approvals visible and editable.
- **"Ask before irreversible" default:** built into policy tiers.
- **Do not copy:** NanoMuse's specific app ecosystem/protocols unless needed; keep contracts generic.

## 10. Architectural Invariants

1. No external write without policy decision record.
2. No approval reuse on changed action hash.
3. No secret in model context unless explicitly redacted/transformed and policy-approved.
4. No task marked succeeded without evidence/receipt/check.
5. No silent retry for non-idempotent uncertain operations.
6. Every event carries `task_id`, `run_id`, `session_id` where applicable.
7. UI state is projection of persisted events/state, not hallucinated.

## 11. Key ADRs to Create During Implementation

- ADR-001: Hermes integration mode (embedded, sidecar, service).
- ADR-002: Temporal adoption scope (all tasks vs long-running only).
- ADR-003: Browser primary backend (BrowserOS vs Playwright first).
- ADR-004: Canonical event schema (AG-UI extension vs custom).
- ADR-005: Secret vault implementation (local desktop vs hosted).
- ADR-006: Memory store/index (Postgres FTS + pgvector vs external).
- ADR-007: Multi-device hub protocol (future).
- ADR-008: Skill packaging and signing.



---


# 03 - Frontend - OpenFUSE-Style UI Blueprint

## 1. UI Goal

Deliver an **OpenFUSE-like** interface where the user can delegate work, watch execution live, intervene safely, and trust outcomes. The UI is a control surface over real backend state.

## 2. Design Principles

- **Calm, operational, evidence-first.** No fake "agent magic".
- **Live but stable.** Stream updates without layout jitter.
- **Actionable transparency.** Every step shows what, why, where, and result.
- **Control always available.** Pause/stop/takeover/approve are one click away.
- **Risk clarity.** Sensitive actions visually distinct and require deliberate confirmation.

## 3. Information Architecture

```text
App Shell
├── Chat (primary)
│   ├── Thread list / main thread
│   ├── Message composer
│   ├── Agent response stream
│   └── Inline cards (plan, browser, email, files, approvals, artifacts)
├── Activity / Tasks
│   ├── Task list (active, waiting, scheduled, completed, failed)
│   ├── Task detail (timeline, evidence, receipts, logs)
│   └── Run controls (pause/resume/cancel/retry)
├── Browser Workspace
│   ├── Live session preview
│   ├── URL/title/status
│   ├── Takeover / Return control
│   └── Downloads/screenshots
├── Computer Workspace (v1)
│   ├── Terminal
│   ├── Files
│   └── Desktop stream (optional provider)
├── Integrations / Apps
│   ├── Connected accounts
│   ├── MCP servers
│   └── Permissions/scopes
├── Memory / Skills
│   ├── Memory inspect/edit/delete/export
│   └── Skill registry/playbooks
└── Settings
    ├── Models/providers/routing
    ├── Approval policy defaults
    ├── Privacy/data retention
    └── Diagnostics/export
```

## 4. Primary Screens and Components

### 4.1 Chat Screen (Home)

**Layout:** 3-column responsive (collapsible on mobile)
- Left: thread/task nav.
- Center: conversation + inline execution cards.
- Right: context panel (current task, approvals, artifacts, browser preview).

**Components:**
- `Composer`: multiline input, attach files, mode/model indicator, send/stop button in same control.
- `MessageList`: virtualized, sticky "jump to latest", streaming tokens/steps.
- `PlanCard`: checklist with step states (`pending/running/waiting/done/failed`).
- `ToolCallCard`: tool name, args summary, status, elapsed, output preview.
- `ApprovalCard`: exact action, target, diff/preview, expiry, approve/deny.
- `EvidenceCard`: sources, screenshots, citations, artifact links.
- `TakeoverBanner`: "Agent paused - you have control".

### 4.2 Activity/Tasks Screen

- Task table/cards with filters: `active`, `waiting_approval`, `waiting_input`, `scheduled`, `failed`, `completed`.
- Task detail timeline merges: plan steps, tool calls, approvals, checkpoints, errors, receipts.
- Controls: pause/resume/cancel/retry/clone-as-template.
- Failure panel: human-readable cause, last good checkpoint, safe retry options.

### 4.3 Browser Workspace

- Live preview (screenshot stream or embedded remote browser view).
- Session metadata: URL, title, profile, owner (agent/user), backend (BrowserOS/Playwright).
- Controls: refresh, navigate, click/type helper (when user in control), take over, return control.
- Evidence rail: screenshots, DOM snapshot hash, downloads, console/network warnings.

### 4.4 Approvals Center

- Pending approvals queue with risk badges.
- Approval detail shows immutable payload:
  - action type, connector/account, target, parameters, diff/preview, idempotency key, expiry.
- Buttons: Approve once, Deny, Edit & re-propose (creates new proposal).
- Receipt view after execution: status, provider response, timestamp, audit ID.

### 4.5 Integrations / Apps

- Connector cards: status, account, scopes, last health check, test action.
- OAuth connect/reconnect/disconnect.
- MCP server registry: endpoint, tools discovered, trust level, enable/disable.
- Per-connector policy defaults (read auto, write ask, destructive block).

### 4.6 Settings

- Model providers: add key/base URL/local endpoint, model roles, routing rules, data-sensitivity policy.
- Execution: browser backend preference, sandbox limits, timeout defaults.
- Privacy: memory toggle, retention, export/delete, telemetry opt-in.
- Developer: event log viewer, webhook/debug mode, feature flags.

## 5. UI State Model

### 5.1 Frontend State Layers

| Layer | Store | Examples |
|---|---|---|
| Server state | TanStack Query / RTK Query | tasks, threads, approvals, connectors, artifacts |
| Realtime event state | WebSocket/AG-UI stream reducer | token deltas, step updates, tool events |
| Local UI state | Zustand/Redux/UI reducer | selected tab, panel open, draft text, filters |
| Ephemeral media state | component state | screenshot blob URL, console scroll |

### 5.2 Canonical UI Task State

```ts
type UiTaskStatus =
  | "queued" | "planning" | "running" | "waiting_approval"
  | "waiting_input" | "paused" | "scheduled" | "succeeded"
  | "failed" | "cancelled" | "blocked";
```

UI must render only backend-confirmed states. Optimistic updates allowed only for view controls, not execution truth.

## 6. Event-Driven Rendering (AG-UI / Event Schema)

Use an AG-UI-compatible event stream as the base, extended with OpenFUSE-style execution events.

```ts
type UiEvent = {
  eventId: string;
  taskId: string;
  runId?: string;
  sessionId?: string;
  sequence: number;
  ts: string;
  type:
    | "assistant.message.delta" | "assistant.message.completed"
    | "task.plan.created" | "task.step.updated"
    | "tool.started" | "tool.progress" | "tool.completed" | "tool.failed"
    | "approval.required" | "approval.resolved"
    | "browser.frame" | "browser.state"
    | "artifact.created" | "task.completed" | "task.failed";
  payload: Record<string, unknown>;
};
```

**Reducer rules:**
- Ignore duplicate `eventId`.
- Buffer out-of-order events by `sequence` per task/run.
- Mark stream stale if heartbeat missing > N seconds.
- Never render secret-bearing payload fields.

## 7. OpenFUSE UI Patterns to Reuse

From `Demo/openfuse`:
- **Composer send/stop in same control** and draft retention.
- **Inline tool/browser/email/PDF/plan/finance cards** in chat.
- **Visible follow-up queue**; stopping reply does not cancel durable task.
- **Action review** as distinct, stored object with explicit decision.
- **Browser takeover console** tied to same session.
- **Activity/receipt navigation** from chat cards.
- **Capybara/avatar state** indicating active/waiting/needs input (optional branding).

## 8. Component Library and Frontend Stack

| Layer | Recommendation | Notes |
|---|---|---|
| Framework | React + TypeScript + Vite (web), React Native/Expo optional mobile | Matches OpenFUSE demo direction |
| UI primitives | Tailwind + Radix/shadcn | Fast, accessible, consistent |
| Data fetching | TanStack Query | Cache/invalidation for server state |
| Realtime | WebSocket + event reducer | AG-UI stream compatible |
| Charts/timeline | lightweight custom + virtualization | Avoid heavy deps |
| Forms/validation | React Hook Form + Zod | Approval/config forms |
| Desktop shell | Tauri (preferred) or Electron | Local gateway integration |

## 9. Accessibility and UX Quality

- Keyboard navigable approvals and task controls.
- ARIA live regions for task status changes.
- Color not sole risk indicator; use labels/icons/text.
- Focus trap in approval modal; confirm destructive actions.
- "What happened?" panel for every failure.
- Mobile: collapse to chat + activity + approvals; browser preview as snapshot.

## 10. Frontend Security

- No secrets/tokens in localStorage; use httpOnly cookies or secure desktop storage.
- Render untrusted tool/web content as data, never HTML-executable by default.
- Sanitize markdown; disable raw HTML or use strict allowlist.
- Signed URLs for artifacts/screenshots with short TTL.
- CSP, frame protections, origin checks.

## 11. Implementation Checklist

1. Build app shell, routing, auth guard, theme/tokens.
2. Implement chat thread + composer + stream renderer.
3. Implement task list/detail with realtime reducer.
4. Implement approval cards/center with exact payload display.
5. Implement browser workspace preview/takeover.
6. Implement integrations/settings pages.
7. Add error boundaries, skeletons, empty/loading states.
8. Add E2E tests for stream ordering, approval, takeover, cancel.

## 12. Acceptance Criteria

- User can distinguish agent running vs waiting vs failed within 1 glance.
- Approval screen shows exact action and cannot approve stale/changed payload.
- Browser preview corresponds to actual controlled session ID.
- Task timeline reconstructs from persisted events after refresh.
- Stop/cancel immediately updates UI after backend acknowledgement.
- UI remains usable on desktop and narrow viewport.



---


# 04 - Backend Control Plane

## 1. Role

The control plane is the trusted backend that owns users, tasks, policies, approvals, connectors, events, artifacts, and audit. It orchestrates Hermes, tool execution, and Temporal workflows while enforcing security boundaries.

## 2. Service Decomposition

Start as a **modular monolith** with clear internal boundaries; extract workers/services when scale or isolation requires.

| Module | Responsibility | Storage |
|---|---|---|
| Auth & Identity | Sessions, API keys, device auth, RBAC (single-user now) | Postgres |
| Task Service | Task CRUD, state machine, checkpoints, leases | Postgres |
| Event Service | Append-only events, WS fanout, replay cursors | Postgres + Redis pubsub |
| Orchestrator | Hermes run lifecycle, tool dispatch, run budgets | Postgres/Redis |
| Policy/Approval | Risk evaluation, approval requests, grants, receipts | Postgres + Vault |
| Connector Service | OAuth, scopes, health, connection metadata | Postgres + Vault |
| Artifact Service | Files, screenshots, reports, signed URLs | Object store + Postgres metadata |
| Memory Service | Memory records, provenance, retrieval index | Postgres + pgvector/FTS |
| Audit Service | Immutable audit log, export | Postgres append-only |

## 3. API Style

- **External API:** REST + WebSocket/SSE for events.
- **Internal service calls:** typed functions now; gRPC/HTTP later.
- **Schemas:** Zod/TypeBox/Pydantic equivalent; generate OpenAPI.
- **Versioning:** `/v1` prefix; event `schemaVersion`.

## 4. Core APIs (v1)

### 4.1 Tasks

```http
POST   /v1/tasks                      # create task
GET    /v1/tasks                      # list/filter
GET    /v1/tasks/:id                  # detail
POST   /v1/tasks/:id/control          # pause/resume/cancel/retry
POST   /v1/tasks/:id/input            # provide waiting_input
GET    /v1/tasks/:id/events           # replay events (cursor)
GET    /v1/tasks/:id/artifacts
```

### 4.2 Chat/Threads

```http
POST   /v1/threads
GET    /v1/threads/:id/messages
POST   /v1/threads/:id/messages       # user message -> may create/resume task
POST   /v1/threads/:id/stop
WS     /v1/events                     # realtime stream (auth scoped)
```

### 4.3 Approvals

```http
GET    /v1/approvals?status=pending
GET    /v1/approvals/:id
POST   /v1/approvals/:id/decision     # approve/deny
```

### 4.4 Connectors

```http
GET    /v1/connectors
POST   /v1/connectors/:provider/connect
POST   /v1/connectors/:provider/callback
POST   /v1/connectors/:id/disconnect
POST   /v1/connectors/:id/test
```

### 4.5 Browser/Computer

```http
POST   /v1/browser/sessions
POST   /v1/browser/sessions/:id/navigate
POST   /v1/browser/sessions/:id/input
POST   /v1/browser/sessions/:id/takeover
POST   /v1/browser/sessions/:id/release
GET    /v1/browser/sessions/:id/preview
POST   /v1/computer/commands
GET    /v1/computer/files
```

## 5. Task State Machine

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> planning
  planning --> running
  running --> waiting_approval
  waiting_approval --> running: approved
  waiting_approval --> cancelled: denied/cancelled
  waiting_approval --> failed: expired/invalid
  running --> waiting_input
  waiting_input --> queued: input provided
  running --> paused
  paused --> queued: resume
  running --> scheduled
  scheduled --> queued: due
  running --> succeeded
  running --> failed
  running --> cancelled
  failed --> queued: retry (safe)
  succeeded --> [*]
  failed --> [*]
  cancelled --> [*]
```

**State rules:**
- Transitions validated server-side; illegal transitions return 409.
- Terminal states immutable except metadata (e.g., archive flag).
- `succeeded` requires completion criteria/evidence.
- `failed` includes error code, human message, retryability.

## 6. Task Execution Engine

### 6.1 Lease-Based Worker (MVP, OpenFUSE-proven)

Adopt the demo pattern:
- `compareAndSwap` claim: queued/scheduled-due/running-expired -> running with `leaseId`, `leaseUntil`, `attempts+1`.
- Heartbeat extends lease.
- Lost lease/abort throws `LostLeaseError`; worker requeues safely.
- `inFlight` prevents duplicate local execution.

### 6.2 Temporal Activities (V1+)

Map task steps to Temporal activities/workflows:
- Workflow ID = `task:{taskId}` or `goal:{goalId}`.
- Activity types: `plan`, `browser.act`, `connector.call`, `computer.run`, `memory.write`, `approval.wait`.
- Signals: pause/resume/cancel/input/approval.
- Queries: current status, checkpoint, last event.

## 7. Event System

### 7.1 Event Envelope

```json
{
  "eventId": "uuid",
  "schemaVersion": 1,
  "taskId": "task_123",
  "runId": "run_123",
  "sessionId": "sess_123",
  "sequence": 42,
  "ts": "2026-11-22T12:00:00Z",
  "source": "orchestrator|hermes|policy|browser|connector|temporal",
  "type": "tool.completed",
  "correlationId": "tool_call_abc",
  "causationId": "event_prev",
  "payload": {}
}
```

### 7.2 Delivery Semantics

- Append event to DB before acknowledging producer (for critical events).
- Publish to Redis/NATS for live WS fanout.
- Consumers idempotent by `eventId`.
- Client reconnect uses `GET /v1/tasks/:id/events?after=sequence`.

## 8. Orchestrator Responsibilities

1. Receive user goal/thread message.
2. Create/resume task and run context.
3. Load bounded context: goal, memory, recent messages, artifacts, connector state.
4. Call Hermes adapter.
5. For each tool proposal: validate schema -> policy check -> execute/ask.
6. Persist checkpoints after each significant step.
7. Emit normalized events.
8. Finalize with success/failure/blocked + evidence.

## 9. Connector and Action Execution

Adopt OpenFUSE `ActionService` pattern, generalized:

- `prepare(input, owner, connectionId)` resolves current target/version.
- Compute `actionHash` over kind, data, connection, targetVersion.
- Persist `awaiting_review` with expiry.
- `decide(approve/deny)`:
  - deny: mark denied, no side effect.
  - approve: CAS claim to `executing`; revalidate connection/hash/expiry/task status.
  - execute with idempotency key; store result/receipt.
  - uncertain provider outcome -> `outcome_unknown`, never blind retry.

## 10. Background Jobs

| Job | Trigger | Notes |
|---|---|---|
| Lease recovery | interval | Requeue expired running tasks |
| Approval expiry | interval/event | Expire stale approvals |
| Monitor scheduler | cron/Temporal schedule | Run page/API monitors |
| Notification digest | schedule | Batch non-urgent updates |
| Memory consolidation | async queue | Summarize/merge with provenance |
| Artifact cleanup | retention policy | Delete expired temp files |

## 11. AuthN/AuthZ

- **Single-user MVP:** strong local password/session or OS auth; API bearer for workers.
- **Desktop local mode:** bind API to loopback; random session token.
- **Hosted mode:** OIDC/OAuth login, CSRF protection, device sessions.
- **Authorization:** owner scoping on every DB query; worker tokens scoped to task/run.

## 12. Error Handling

Standard error envelope:

```json
{
  "error": {
    "code": "approval_invalid",
    "message": "This proposal changed. Open its latest review before deciding.",
    "retryable": false,
    "details": {}
  }
}
```

Rules:
- 4xx for validation/policy/user errors; 5xx for unexpected/system.
- Never expose secrets/internal stack traces to UI.
- Map provider errors to stable internal codes.

## 13. Backend Technology (Recommended)

| Concern | Default | Alternative |
|---|---|---|
| Runtime | Node.js 22+ TypeScript | Python for ML-heavy services |
| HTTP | Hono/Fastify | Express/NestJS |
| DB | Postgres 16 + Prisma/Drizzle/Kysely | SQLite local-only |
| Queue/pubsub | Redis Streams / NATS | BullMQ, Kafka later |
| Object store | S3-compatible (MinIO local) | local FS dev |
| Realtime | WS (ws/uWebSockets) | SSE |
| Validation | Zod | TypeBox/Valibot |
| Workflows | Temporal | DB-native scheduler for MVP |

## 14. Observability

- OpenTelemetry traces across API -> orchestrator -> tool -> provider.
- Structured JSON logs with `taskId`, `runId`, `eventId`, `owner`.
- Metrics: task success/failure, queue depth, lease recoveries, approval wait time, tool latency, duplicate-prevention hits.
- Redaction middleware before log/export.

## 15. Acceptance Criteria

- Task can be created, executed, paused, resumed, cancelled, and replayed after restart.
- Events are ordered per task and idempotent on consumer replay.
- Approval cannot execute stale/changed action.
- All DB queries owner-scoped.
- Uncertain external action never auto-retried blindly.
- API returns stable error codes and no secrets.



---


# 05 - Hermes Agent Runtime

## 1. Purpose

Hermes is the primary intelligence runtime: it interprets user goals, plans, selects tools, delegates work, and synthesizes results. Hermes is **not** the product authority for permissions, secrets, or external side effects.

## 2. Runtime Contract (OpenFUSE Adapter Interface)

Implement Hermes behind a stable adapter, as proposed in the OpenFUSE blueprint.

```ts
interface AgentRuntime {
  initialize(): Promise<void>;
  health(): Promise<RuntimeHealth>;
  createSession(input: SessionInput): Promise<Session>;
  sendMessage(sessionId: string, input: MessageInput): AsyncIterable<AgentEvent>;
  interrupt(sessionId: string): Promise<void>;
  resume(sessionId: string, checkpointId: string): Promise<void>;
  getStatus(sessionId: string): Promise<AgentStatus>;
  closeSession(sessionId: string): Promise<void>;
  shutdown(): Promise<void>;
}
```

**Implementation note:** Map to real Hermes APIs/versioned interfaces only. Do not invent undocumented endpoints. Pin Hermes version and run contract tests.

## 3. Hermes Responsibilities vs Control Plane

| Hermes owns | Control plane owns |
|---|---|
| Reasoning, planning, decomposition | Task lifecycle, persistence, UI state |
| Tool selection from allowed catalog | Tool authorization, policy, approvals |
| Prompt/context construction | Memory provenance/sensitivity enforcement |
| Subagent delegation logic | Budget/rate/kill switches |
| Natural language output | Audit records, receipts, compliance |

## 4. Execution Loop

```mermaid
flowchart TD
  A[Receive goal + context bundle] --> B[Plan / update plan]
  B --> C{Need tool?}
  C -->|No| D[Respond / produce artifact]
  C -->|Yes| E[Emit tool proposal]
  E --> F[Policy gate]
  F -->|ALLOW| G[Execute tool]
  F -->|ASK_USER| H[Wait for approval/input]
  F -->|DENY| I[Replan or report block]
  H --> G
  G --> J[Observe result/evidence]
  J --> K{Done?}
  K -->|No| B
  K -->|Yes| D
```

## 5. Context Bundle (Bounded, Reconstructable)

Every Hermes run receives a bounded context package, not unlimited history:

```ts
type ContextBundle = {
  task: TaskSummary;
  goal?: GoalSummary;
  userMessage: string;
  recentMessages: Message[];
  relevantMemories: MemoryItem[]; // sensitivity-filtered
  availableTools: ToolManifest[];
  artifacts: ArtifactRef[];
  constraints: { budget; deadline; approvalMode; dataPolicy };
  checkpoint?: Checkpoint;
};
```

Rules:
- Memory retrieval is relevance + permission + sensitivity aware.
- Untrusted content (web/email/docs) labeled as data, not instructions.
- Provider-specific hidden state is cache only; durable state lives in DB.

## 6. Tool Calling Model

### 6.1 Tool Manifest

```ts
type ToolManifest = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  risk: "low" | "medium" | "high" | "critical";
  sideEffect: "none" | "internal" | "external_write" | "destructive";
  idempotent: boolean;
  requiresApproval?: "never" | "policy" | "always";
  scopes?: string[];
};
```

### 6.2 Tool Proposal Envelope

```ts
type ToolProposal = {
  proposalId: string;
  taskId: string;
  tool: string;
  args: unknown;
  rationale: string;
  expectedEffect: string;
  idempotencyKey?: string;
};
```

Hermes emits proposals; executor runs only after validation + policy.

## 7. Planning and Decomposition

- **Plan object** stored as versioned steps.
- Each step has: `id`, `title`, `status`, `dependsOn`, `toolHints`, `acceptance`.
- Replan on: tool failure, new user input, approval denial, changed environment.
- Limit plan churn; preserve completed step evidence.

## 8. Subagents / Delegation

Use delegation only when it improves throughput or isolation.

| Subagent | Purpose | Constraints |
|---|---|---|
| Research agent | Web/docs search and synthesis | No external writes |
| Browser agent | Deterministic browser navigation/extraction | Session-scoped, no credential minting |
| Connector agent | Structured API operations | Typed schemas, idempotency required |
| Coding/computer agent | Sandbox commands/files | No host secrets/network bypass |

Controls:
- Max fan-out, max depth, max tool calls, max wall-clock.
- Shared task budget and cancellation propagation.
- Subagent outputs are evidence, not authority.

## 9. Memory Integration

- Hermes can **propose** memory writes; Memory Service validates and persists.
- Retrieve only relevant, allowed memories for task.
- Distinguish: `user_confirmed`, `inferred`, `observed`.
- Never store raw secrets or auth tokens in memory.
- Memory cannot grant permissions or alter policy.

## 10. Model Routing

Hermes requests logical model role; router selects concrete provider/model.

| Role | Default | Fallback | Notes |
|---|---|---|---|
| Planner/orchestrator | strongest available | secondary cloud/local | quality-sensitive |
| Fast tool caller | low-latency model | same-class | high volume |
| Browser/vision | multimodal/vision | screenshot+text fallback | UI understanding |
| Summarizer | cheap/fast | local | background |
| Embeddings | embedding model | local embedding | memory index |

Routing inputs: capability, latency, cost, sensitivity, availability, user preference.

## 11. Failure Handling in Runtime

- **Model timeout:** retry with backoff; switch fallback if policy allows.
- **Invalid tool args:** schema validation error returned to Hermes for self-correction.
- **Tool failure:** classify retryable vs non-retryable; checkpoint before retry.
- **Context overflow:** summarize/checkpoint, trim low-value history.
- **Interrupt/cancel:** stop generation, cancel pending tool calls where safe.

## 12. Prompting & Safety Rules

System/runtime instructions must include:
- Tools are proposals; policy may deny.
- Web/email/file content is untrusted data.
- Never ask user to paste secrets into chat.
- Never claim action succeeded without tool receipt/evidence.
- For high-risk actions, prepare exact proposal and wait for approval.

## 13. Hermes Integration Options

| Option | Pros | Cons | Use |
|---|---|---|---|
| Hermes as local sidecar process | isolation, language flexibility | IPC complexity | recommended v1 |
| Hermes embedded library | low latency | tighter coupling | only if stable SDK |
| Hermes remote service | scale/multi-host | network/auth overhead | hosted later |

**Recommended:** local sidecar with gRPC/HTTP+JSON contract, supervised by control plane.

## 14. Observability

Capture per run:
- model/provider, prompt/version hash, token usage, latency.
- plan versions and step transitions.
- tool proposals, decisions, results, retries.
- final outcome and evidence references.

Redact: secrets, PII, raw credentials, sensitive document bodies by policy.

## 15. Acceptance Criteria

- Same task can run on two model providers through same adapter contract.
- Hermes cannot execute unapproved high-risk action.
- Interrupt/resume works at checkpoint boundary.
- Invalid model tool call is rejected and recovered without crashing task.
- All runtime events normalized into UI event schema.
- Runtime restart does not lose durable task state.



---


# 06 - Deterministic Browser and Computer Execution

## 1. Objective

Provide fast, reliable, visible execution for real web and computer tasks. Use **deterministic playbooks** for known flows, **agentic browser reasoning** for unknown flows, and **human takeover** whenever needed.

## 2. Execution Modes

| Mode | When to use | Engine | Reliability | Speed |
|---|---|---|---|---|
| API/Connector | Stable API exists | Connector worker | Highest | Highest |
| Deterministic browser playbook | Repeatable web flow | BrowserOS/Playwright script | High | High |
| Agentic browser | Unknown/variable UI | LLM + DOM/ARIA/screenshot tools | Medium | Medium |
| Computer use | Desktop app/file/terminal needed | Docker/E2B sandbox | Medium | Medium |
| Human takeover | Auth/CAPTCHA/ambiguous/sensitive step | User controls session | Highest for blocked step | N/A |

## 3. Browser Architecture

```mermaid
flowchart LR
  ORCH[Orchestrator/Temporal] --> BS[Browser Service]
  BS --> BA[BrowserOS Adapter]
  BS --> PW[Playwright Adapter]
  BA --> S1[Browser Session/Profile]
  PW --> S1
  S1 --> ART[Artifacts: screenshots/downloads/trace]
  S1 --> LIVE[Live Preview Stream]
  BS --> EVT[Event Bus]
  BS --> POL[Policy Gate]
```

### 3.1 Browser Adapter Contract

```ts
interface BrowserExecutionProvider {
  capabilities(): Promise<BrowserCapabilities>;
  launch(input: LaunchInput): Promise<BrowserSession>;
  attach(sessionId: string): Promise<BrowserSession>;
  navigate(sessionId: string, url: string): Promise<ActionResult>;
  observe(sessionId: string): Promise<PageObservation>; // DOM/ARIA/text/screenshot
  act(sessionId: string, action: BrowserAction): Promise<ActionResult>;
  extract(sessionId: string, query: ExtractQuery): Promise<ExtractResult>;
  startTrace(sessionId: string): Promise<void>;
  stopTrace(sessionId: string): Promise<ArtifactRef>;
  pause(sessionId: string): Promise<void>;
  grantHumanControl(sessionId: string): Promise<ControlLease>;
  returnControl(leaseId: string): Promise<PageObservation>;
  close(sessionId: string): Promise<void>;
}
```

### 3.2 BrowserOS Role (User Requirement)

Use BrowserOS for its deterministic/browser-agent strengths where available:
- Native browser session control and extension-level capabilities.
- Deterministic scripted actions/playbooks.
- Better handling of real browser state/profile/cookies (with explicit user consent).
- Potential lower-latency local execution for UI interactions.

**Caution:** Verify actual BrowserOS/BrowserOS Neo APIs on Windows, live view, takeover, and session ownership before committing. Keep Playwright as production fallback.

### 3.3 Playwright Role

- Default reliable cross-platform backend.
- Persistent contexts/profiles per owner/session.
- Screenshot, DOM text extraction, download capture, tracing.
- Headed mode for takeover; headless for background jobs where safe.

## 4. Deterministic Playbook System

### 4.1 Playbook Format

```yaml
id: gmail-send-reply-v1
version: 1
risk: high
inputs:
  - name: threadId
  - name: replyText
preconditions:
  - connector.gmail.connected
  - approval.required
steps:
  - id: open
    action: browser.navigate
    url: "https://mail.google.com/mail/u/0/#inbox/{{threadId}}"
  - id: click_reply
    action: browser.click
    target: { role: button, name: "Reply" }
    timeoutMs: 10000
  - id: type
    action: browser.type
    target: { role: textbox, name: "Message Body" }
    value: "{{replyText}}"
  - id: submit
    action: browser.click
    target: { role: button, name: "Send" }
    requiresApproval: true
postconditions:
  - receipt.exists
```

### 4.2 Playbook Principles

- Prefer **ARIA roles/names**, stable data-testid, then CSS/XPath fallback.
- Every step has timeout, retry policy, and success assertion.
- Capture screenshot before/after high-risk steps.
- Parameterize inputs; never hardcode secrets.
- Version playbooks; test against fixture and live canary flows.
- Playbooks produce evidence and receipts, not just "done".

## 5. Browser Observation Strategy

Use layered observation for speed and robustness:

1. **Accessibility tree / DOM snapshot** - primary for deterministic actions.
2. **Visible text extraction** - for reading/summarization.
3. **Screenshot/vision** - fallback for canvas/complex UI.
4. **Network/console signals** - optional diagnostics, not authority.

Avoid sending full raw page HTML to model. Send compact structured observation:

```json
{
  "url": "...",
  "title": "...",
  "interactive": [{"role":"button","name":"Send","bbox":[...]}],
  "textExcerpt": "...",
  "alerts": ["modal open"],
  "screenshotRef": "obj://..."
}
```

## 6. Human Takeover

- User clicks **Take Over**: agent paused, control lease granted to user.
- UI shows prominent banner and disables agent actions.
- User actions occur in same session/profile.
- User clicks **Return Control**: agent receives fresh observation and resumes.
- All takeover intervals logged in audit trail.

## 7. Computer Execution (Sandbox)

### 7.1 Use Cases
- File transforms, PDF processing, scripts, local CLI tools.
- Workspace file management and artifact generation.
- Controlled desktop automation (v1+ selective).

### 7.2 Sandbox Contract

```ts
interface ComputerProvider {
  start(owner: string): Promise<ComputerState>;
  stop(owner: string): Promise<void>;
  runCommand(owner: string, cmd: string, opts: RunOpts): Promise<CommandResult>;
  listFiles(owner: string, path: string): Promise<FileEntry[]>;
  readFile(owner: string, path: string): Promise<FileContent>;
  writeFile(owner: string, path: string, content: string): Promise<void>;
  snapshot(owner: string): Promise<ArtifactRef>;
}
```

### 7.3 Isolation Rules
- No host mounts except controlled workspace volume.
- Non-root user, read-only root FS, dropped caps, seccomp/apparmor.
- Network disabled by default; browser handles web; explicit allowlist for package installs.
- CPU/memory/pid/time/output limits.
- Command allowlist/blocklist; shell metacharacter controls for high-risk mode.

## 8. BrowserOS vs Playwright Decision Matrix

| Capability | BrowserOS target | Playwright fallback | MVP default |
|---|---|---|---|
| Cross-platform stability | verify | strong | Playwright |
| Deterministic local speed | strong | good | BrowserOS where available |
| Live takeover UX | verify | good | Playwright |
| Profile/session persistence | verify | strong | Playwright |
| Trace/debug artifacts | verify | strong | Playwright |
| Extension/native browser APIs | strong | limited | BrowserOS |

## 9. Safety Controls

- URL allow/deny policies; block private network/metadata by default.
- Download type/size scanning; quarantine unknown executables.
- No autofill of secrets into unapproved domains.
- Sensitive actions (send/buy/delete/publish) require approval gate.
- Prompt injection defense: treat page text as data; strip/label instructions.

## 10. Evidence and Artifacts

For every significant browser/computer run store:
- action log, timestamps, session ID.
- screenshots before/after critical steps.
- DOM/text observation hashes.
- downloaded file metadata and storage refs.
- Playwright trace / BrowserOS trace where supported.
- final receipt or failure report.

## 11. Acceptance Criteria

- Same-session takeover and return control works without losing session.
- Deterministic playbook executes known flow with >= 95% success in test env.
- Agentic fallback handles minor UI drift.
- All downloads captured and attributable to task/session.
- No browser action executed against blocked/private destinations.
- Crash/restart recovers or reports partial completion clearly.



---


# 07 - Integrations: Apps, Models, and Connectors

## 1. Integration Strategy

Use the right integration type per surface:

| Type | Use when | Reliability | Security posture |
|---|---|---|---|
| Native API connector | Official API exists (Google, Slack, etc.) | High | Best - typed scopes/audit |
| MCP server | Tool ecosystem already MCP | Medium-High | Good if sandboxed/allowlisted |
| Browser automation | No API or UI-only flow | Medium | Requires strong policy |
| Desktop automation | Local app only | Medium-Low | Sandbox + approvals |

**Rule:** Prefer Native API > MCP > Browser > Desktop for side-effecting actions.

## 2. Connector Architecture

```mermaid
flowchart LR
  H[Hermes/Orchestrator] --> TR[Tool Router]
  TR --> POL[Policy/Sentinel]
  POL --> REG[Connector Registry]
  REG --> CW[Connector Worker]
  CW --> VAULT[Vault/Token Broker]
  CW --> EXT[External App/API]
  CW --> AUD[Audit + Receipt]
```

### 2.1 Connector Manifest

```yaml
name: gmail
version: 1
kind: native_api
auth: oauth2
scopes:
  - https://www.googleapis.com/auth/gmail.readonly
  - https://www.googleapis.com/auth/gmail.send
actions:
  - name: gmail.searchThreads
    risk: low
    idempotent: true
  - name: gmail.createDraft
    risk: medium
    idempotent: true
  - name: gmail.sendDraft
    risk: high
    idempotent: true
    requiresApproval: always
```

## 3. Connector Lifecycle

1. **Register** - manifest, schemas, risk, auth type.
2. **Connect** - OAuth/device auth/API key; store secret in vault, metadata in DB.
3. **Health check** - periodic token/scope/API test.
4. **Use** - policy-gated typed invocation.
5. **Rotate** - refresh tokens/keys.
6. **Disconnect/Revoke** - invalidate tokens, disable tools immediately, preserve audit.

## 4. MVP Connectors

| Connector | Actions | Risk | Approval |
|---|---|---|---|
| Gmail | search/read threads, create draft, send | send=high | send always |
| Google Calendar | list, create, update, delete event | write=medium/high | writes ask |
| Web browser | navigate/read/extract/fill/submit | varies | submit/send/pay ask |
| Filesystem (sandbox) | read/write/export | medium | writes outside workspace ask |
| Web search | query/fetch sources | low | no |

## 5. V1 Connectors

- Slack/Teams messaging (approval-gated send).
- Notion/Docs/Drive.
- GitHub issues/PR comments.
- WhatsApp/Telegram via official APIs or approved bridges.
- MCP server hub (user-added, sandboxed).

## 6. MCP Integration

### 6.1 MCP Policy

- Allowlist MCP servers; default deny unknown.
- Pin server version/command/image digest.
- Run local MCP servers in sandbox (no host network unless needed).
- Tool discovery cached; schema hash tracked.
- Per-tool risk classification overrides allowed only downward? No - policy can raise risk.

### 6.2 MCP Trust Levels

| Level | Description | Allowed |
|---|---|---|
| Trusted first-party | maintained by you/org | all policy-gated tools |
| Verified third-party | reviewed, pinned | read auto, writes ask |
| Unverified | user-added unknown | disabled by default |

## 7. Model Provider Integration (BYOM)

### 7.1 Provider Abstraction

Use OpenMuse-style provider-neutral contract:

```ts
interface ModelAdapter {
  capabilities(): ModelCapabilities;
  generate(req: NormalizedModelRequest): AsyncIterable<NormalizedModelEvent>;
  countTokens?(req): Promise<number>;
  health(): Promise<Health>;
}
```

### 7.2 Supported Provider Types

- OpenAI-compatible (OpenAI, Azure OpenAI, vLLM, Ollama, LM Studio, Groq, etc.)
- Anthropic-compatible
- Google/Gemini
- Local inference (Ollama/llama.cpp/vLLM)

### 7.3 Model Routing Policy

```yaml
routing:
  default: cloud.fast
  roles:
    planner: cloud.best
    browser_vision: cloud.vision
    summarizer: local.fast
    embeddings: local.embed
  sensitivity:
    public: any
    internal: approved_cloud_or_local
    restricted: local_only
  fallback:
    enabled: true
    require_same_sensitivity: true
    require_required_capabilities: true
```

### 7.4 Model Governance

- Per-provider data policy shown in UI.
- Token/cost budgets per task/day.
- Provider health checks and circuit breakers.
- Prompt/response logging redacted and configurable.

## 8. App Integration UX

- "Connect app" wizard: explain scopes, risk, example actions.
- Connection status badges: connected, degraded, expired, revoked.
- Test button runs low-risk health action.
- Disconnect immediately disables future actions and revokes tokens where supported.
- Show "Used by tasks" before disconnect.

## 9. Credential and Secret Handling

- OAuth tokens/API keys stored in vault only.
- DB stores `credentialRef`, scopes, expiry, account label.
- Workers receive short-lived scoped token or brokered request.
- Refresh tokens rotated; access tokens short TTL.
- Redact secrets from events, logs, traces, prompts.

## 10. Rate Limits, Retries, and Quotas

| Layer | Control |
|---|---|
| Connector | Per-provider rate limiter, backoff, jitter |
| Model | RPM/TPM/cost budget, concurrency limit |
| Browser | Domain/action pacing, max parallel sessions |
| User/task | Max active tasks, max tool calls, max runtime |

Retry rules:
- Retry idempotent reads/writes with idempotency key.
- Do not blindly retry uncertain external writes.
- On 429/5xx: exponential backoff with cap.

## 11. Integration Testing

- Contract tests per connector (mock provider).
- Sandbox/live smoke tests with test accounts.
- OAuth flow tests (connect/refresh/revoke).
- MCP server conformance and isolation tests.
- Model adapter conformance suite.
- Policy tests: scope escalation, disconnected connector, expired token.

## 12. Acceptance Criteria

- Adding a new connector requires manifest + adapter + tests, no core rewrite.
- Disconnected connector cannot be used by runtime.
- Model provider swap does not change task schema.
- MCP untrusted server cannot access vault or bypass policy.
- All external writes produce receipt/audit record.



---


# 08 - Temporal-Like Reliable Execution

## 1. Goal

Make the assistant execute real tasks with **no silent failures**. Long-running work must be durable, observable, retry-safe, and recoverable after crashes, restarts, or provider outages.

> "No fail" in product terms means: **every action reaches a known terminal or waiting state with evidence; retries are bounded and safe; uncertain side effects are reconciled, not guessed.**

## 2. Reliability Model

| Property | Mechanism |
|---|---|
| Durability | Persist task/workflow state before ack; Temporal workflow history |
| At-least-once activity execution | Temporal activity retries / worker leases |
| Effectively-once external side effects | Idempotency keys + dedupe + receipt verification |
| Recoverability | Checkpoints, replay, resume signals |
| Visibility | Event log, timeline, receipts, alerts |
| Safety | Policy gates, approval signals, compensation/rollback where possible |

## 3. Why Temporal

OpenFUSE demo has DB lease worker (good MVP). Temporal adds:
- Durable timers/sleeps/schedules.
- Workflow replay after worker crash.
- Signals/queries for pause/resume/approval/cancel.
- Activity retry policies and timeouts.
- Native visibility and long-running workflow management.

## 4. Execution Topology

```mermaid
flowchart TB
  UI[UI/API] --> TS[Task Service]
  TS --> TQ[Temporal Client]
  TQ --> TW[Temporal Workflow Worker]
  TW --> AW[Activity Workers]
  AW --> BR[Browser Worker]
  AW --> CW[Connector Worker]
  AW --> CMP[Computer Worker]
  AW --> POL[Policy Service]
  TW --> DB[(Task DB)]
  AW --> DB
  TW --> EVT[Event Bus]
```

## 5. Workflow Design

### 5.1 Workflow Types

| Workflow | Trigger | Duration | Pattern |
|---|---|---|---|
| `TaskWorkflow` | user task | seconds-hours | plan -> execute steps -> finalize |
| `ApprovalWorkflow` | high-risk action | minutes-days | wait signal/timeout |
| `MonitorWorkflow` | schedule | days-months | periodic check, dedupe, notify |
| `RecoveryWorkflow` | failure/uncertain | variable | verify external state, reconcile |

### 5.2 TaskWorkflow Pseudocode

```ts
export async function taskWorkflow(input: TaskInput) {
  let state = await activities.initTask(input);
  state = await activities.plan(state);

  while (!state.done) {
    state = await waitForUnblockedState(state); // pause/cancel/approval/input signals

    const step = selectNextStep(state);
    const decision = await activities.evaluatePolicy(step);

    if (decision === "DENY") { state = markBlocked(state, step); continue; }
    if (decision === "ASK_USER") {
      await activities.requestApproval(step);
      const signal = await waitForApprovalSignal(step.id, timeout);
      if (!signal.approved) { state = markCancelledOrBlocked(state); continue; }
    }

    try {
      const result = await activities.executeStep(step, {
        idempotencyKey: step.idempotencyKey,
        timeout: step.timeout,
        retryPolicy: step.retryPolicy,
      });
      state = await activities.checkpointSuccess(state, step, result);
    } catch (err) {
      state = await activities.handleFailure(state, step, err);
    }
  }

  return await activities.finalizeTask(state);
}
```

## 6. Signals and Queries

### Signals
- `pause`, `resume`, `cancel`
- `provideInput(payload)`
- `approvalDecision({approvalId, approved, actor, reason})`
- `takeoverStarted`, `takeoverEnded`
- `externalEvent({type, data})`

### Queries
- `getStatus()`
- `getCurrentStep()`
- `getCheckpoint()`
- `getPendingApprovals()`

## 7. Idempotency and Deduplication

### 7.1 Idempotency Keys

Every external side effect gets deterministic key:

```text
idem:{tenant}:{taskId}:{stepId}:{action}:{targetHash}:{argsHash}
```

Store in `action_receipts` with unique constraint. Reuse result on replay/retry.

### 7.2 Action Receipt

```ts
type ActionReceipt = {
  id: string;
  taskId: string;
  stepId: string;
  idempotencyKey: string;
  actionType: string;
  target: string;
  requestHash: string;
  status: "executed" | "uncertain" | "failed";
  providerId?: string;
  responseMeta?: object;
  createdAt: string;
};
```

### 7.3 Uncertain Outcome Rule

If timeout/network error after possible write:
1. Mark `uncertain`.
2. Query provider for state using idempotency/provider ID.
3. If confirmed executed -> convert to receipt.
4. If confirmed not executed -> safe retry.
5. If still unknown -> escalate to user/manual reconciliation; do **not** blind retry.

## 8. Retry Policies

| Action class | Retry | Policy |
|---|---|---|
| Pure read | yes | exponential backoff, max 5 |
| Idempotent write with key | yes | limited, verify receipt |
| Non-idempotent write | no/guarded | verify-before-retry only |
| Browser click/type | yes | with state assertion |
| LLM generation | yes | backoff + fallback model |
| Approval wait | no retry | timeout/escalation |

Default activity options:
- `startToCloseTimeout`: per action type.
- `heartbeatTimeout`: long browser/computer actions.
- `retryPolicy`: non-retryable error types include `PolicyDenied`, `ValidationError`, `ApprovalRejected`.

## 9. Compensation / Rollback

Not all real-world actions roll back. Use compensations where possible:

| Action | Compensation |
|---|---|
| Create draft | delete draft |
| Create calendar event | delete event |
| Upload temp artifact | delete artifact |
| Send email / external submit | no true rollback; send correction/follow-up task |

Workflow must record compensability and execute compensations on cancellation/failure when safe.

## 10. Scheduling and Monitors

Temporal Schedules replace cron where possible:
- Monitor web page/API for changes.
- Daily/weekly summaries.
- Follow-up reminders.
- SLA/overdue task escalations.

Deduplication: hash observation + condition window to avoid noisy repeat notifications.

## 11. Human-in-the-Loop

- Approval requests are workflow signals, not chat text.
- Takeover pauses automation activities and extends heartbeat/timeout.
- User input resumes from checkpoint with fresh observation.
- Manual resolution can close `uncertain` receipts.

## 12. Failure Matrix

| Failure | Detection | Response |
|---|---|---|
| Worker crash | heartbeat/lease timeout | replay workflow/reschedule activity |
| Model provider 5xx | activity error | retry/fallback model |
| Browser crash | session health check | restart session, restore checkpoint |
| Connector rate limit | 429 | backoff, reschedule |
| Duplicate delivery | receipt/idempotency lookup | return prior result |
| Partial completion | checkpoint + missing steps | resume or compensate |
| Unknown external write | timeout/ambiguous response | reconciliation workflow |

## 13. Operational Controls

- Concurrency limits per owner/task/provider.
- Max workflow duration and max steps.
- Dead-letter/manual review queue for irreconcilable actions.
- Kill switch: disable all external writes.
- Replay testing in staging before workflow version rollout.

## 14. MVP to V1 Migration

**MVP:** DB lease worker + checkpoints + idempotency + receipts (OpenFUSE pattern).  
**V1:** Introduce Temporal for long-running/scheduled/high-risk workflows first; keep simple tasks on DB worker if desired.  
**V2:** All durable tasks on Temporal; DB worker only for lightweight ephemeral jobs.

## 15. Acceptance Criteria

- Kill worker mid-task; task resumes or fails clearly with no duplicate side effect.
- Duplicate signal/event delivery does not duplicate action.
- Approval timeout transitions to explicit state.
- Uncertain send/write is reconciled before retry.
- Monitor workflow runs across restart and dedupes observations.
- 100% external writes have idempotency key and receipt record.



---


# 09 - Security, Approvals, and Privacy

## 1. Security Posture

Assume the agent runtime, model output, web content, and third-party tools can be malicious or wrong. Security must be enforced by deterministic control-plane components.

**Core invariant:** Untrusted runtime cannot grant itself permissions, access raw secrets, bypass approvals, or perform unauthorized egress.

## 2. Threat Model (Prioritized)

| Threat | Vector | Impact | Mitigation |
|---|---|---|---|
| Prompt injection | Web/email/docs/tool output | unauthorized action/data exfil | content labeling, policy gate, no instruction-following from data |
| Approval spoofing | model/chat says "approved" | unintended send/buy/delete | structured approval objects, signed decisions, hash binding |
| Secret exfiltration | tool output, logs, prompt | account compromise | vault refs, redaction, brokered credentials |
| SSRF/private network | browser/fetch/tool URL | internal data access | URL validation, DNS/IP checks, egress proxy |
| Duplicate side effects | retries/timeouts | double-send/pay | idempotency keys, receipts, reconciliation |
| Privilege escalation | connector scope creep | overbroad access | least-privilege scopes, per-action policy |
| Malicious MCP/skill | untrusted tool package | RCE/data theft | sandbox, allowlist, signed manifests, no auto-secrets |

## 3. Sentinel / Policy Engine

Adopt OpenMuse Sentinel pattern as `PolicyDecisionService`.

```ts
type ActionRequest = {
  requestId: string;
  taskId: string;
  runId: string;
  actor: "agent" | "user" | "system";
  tool: string;
  action: string;
  resource: string;
  args: Record<string, unknown>;
  risk: "low" | "medium" | "high" | "critical";
  dataSensitivity: "public" | "internal" | "restricted";
  idempotencyKey?: string;
};

type PolicyDecision =
  | { decision: "ALLOW"; grantId?: string; constraints?: object }
  | { decision: "DENY"; reason: string }
  | { decision: "ASK_USER"; approvalId: string; prompt: ApprovalPrompt };
```

**Decision rules:**
- Deny by default for unknown tools/resources.
- Risk tier + connector scope + user policy + context.
- High-risk writes require approval unless explicit standing grant.
- Critical actions (payments, account security, destructive admin) require fresh approval every time.

## 4. Approval System

### 4.1 Approval Object

```ts
type ApprovalRequest = {
  approvalId: string;
  taskId: string;
  actionHash: string; // hash of tool+args+target+connection+version
  title: string;
  summary: string;
  risk: "medium" | "high" | "critical";
  expiresAt: string;
  status: "pending" | "approved" | "denied" | "expired" | "executed";
  preview: object; // email draft, calendar diff, form submit payload
};
```

### 4.2 Binding Rules

- Approval binds to exact `actionHash`.
- Any change to recipient, amount, URL, account, file path, or payload => invalidate.
- Approval single-use unless explicitly scoped standing grant (low/medium only).
- Expiry required (default 10-30 min).
- Decision recorded with actor, timestamp, UI surface, IP/device.

## 5. Identity, Auth, and Authorization

- **AuthN:** local session (desktop) or OIDC (hosted).
- **AuthZ:** owner-scoped resources; RBAC ready but single-user MVP.
- **Worker auth:** short-lived service tokens scoped to task/run.
- **Session security:** httpOnly secure cookies, CSRF for browser clients, loopback binding in local mode.

## 6. Secret Management

| Secret type | Storage | Runtime access |
|---|---|---|
| OAuth refresh/access tokens | Vault/KMS encrypted | brokered short-lived handle |
| API keys | Vault | connector worker only |
| Local encryption key | OS keychain/secure file | control plane |
| User passwords | never stored by agent | user enters directly in takeover |

Rules:
- Never put secrets in prompts, events, logs, or memory.
- Mask/redact secret-like patterns in tool output.
- Rotate/revoke on disconnect or suspected compromise.

## 7. Sandbox and Isolation

### Browser worker
- Separate process/container.
- Per-user profile isolation.
- No access to vault.
- Egress policy and download scanning.

### Computer worker
- Docker/E2B sandbox, non-root, no host socket.
- Workspace volume only.
- Resource limits and command policy.
- Network off by default.

### MCP/Skill runtime
- Untrusted by default.
- Allowlist + version pin + manifest signature/checksum.
- No credentials unless explicit brokered scope.

## 8. Data Privacy

### 8.1 Data Classes

| Class | Examples | Handling |
|---|---|---|
| Public | public web pages | normal logs |
| Internal | tasks, preferences | encrypted at rest, access controlled |
| Restricted | emails, files, tokens, financial | redacted logs, strict retention, local-only routing option |

### 8.2 Privacy Controls

- Memory inspect/edit/delete/export.
- "Do not remember" mode.
- Data retention policies per artifact/log type.
- Provider data routing policy (local-only for restricted).
- Clear consent for cloud model usage.

## 9. Audit Logging

Audit every sensitive event:
- approval requested/decided/expired
- connector connected/disconnected/token refreshed
- external write attempted/executed/failed/uncertain
- takeover start/end
- policy deny/allow
- secret access by broker (metadata only)

Audit record fields: `id, ts, actor, owner, taskId, action, resource, decision, reason, ip/device, correlationId`. Immutable append-only.

## 10. Egress and Network Controls

- Deny private IP ranges, link-local, metadata IPs by default.
- DNS rebinding protection: resolve and recheck.
- Allowlists for high-risk environments.
- Separate egress policies for browser, connectors, model providers.
- TLS verification required; pinning optional for critical connectors.

## 11. Incident Response

- Emergency stop endpoint/UI: pause all tasks, block external writes.
- "Revoke all connections" action.
- Audit export for investigation.
- Secret rotation playbook.
- Incident severity levels and notification.

## 12. Security Testing

- Prompt injection suite (web/email/pdf).
- Approval bypass tests.
- SSRF/egress tests.
- Secret redaction tests.
- Idempotency/duplicate action tests.
- Sandbox escape attempts (baseline).
- Dependency scanning, SAST, container scanning.

## 13. Acceptance Criteria

- No high-risk action executes without approval record bound to hash.
- No raw secret appears in logs/events/memory.
- Disconnected/revoked connector is unusable immediately.
- SSRF to private/metadata addresses blocked.
- Audit trail sufficient to reconstruct sensitive action lifecycle.
- Emergency stop blocks new external writes within seconds.



---


# 10 - Data Model and APIs

## 1. Data Design Principles

- **Single source of truth** per entity.
- **Append-only events/audit**; mutable current-state projections.
- **Owner-scoped** every row.
- **Idempotency-aware** for external actions.
- **Schema-versioned** events and API payloads.

## 2. Core Entities (Postgres)

### 2.1 Identity and Config

```sql
users(id pk, email, name, created_at);
sessions(id pk, user_id fk, device_id, created_at, expires_at, revoked_at);
user_settings(user_id pk, model_policy jsonb, approval_policy jsonb, privacy jsonb, ui jsonb);
```

### 2.2 Tasks and Runs

```sql
tasks(
  id pk, user_id fk, thread_id fk null, goal_id fk null,
  title, prompt, kind, status, priority,
  plan jsonb, checkpoint jsonb, state jsonb,
  current_step_id, attempts int, max_attempts int,
  lease_owner, lease_until, next_run_at,
  error_code, error_message, result jsonb,
  created_at, updated_at, started_at, completed_at
);

task_runs(
  id pk, task_id fk, user_id fk, attempt int,
  status, model_profile, started_at, ended_at,
  token_usage jsonb, cost_usd numeric, error jsonb
);

task_steps(
  id pk, task_id fk, step_index int, title, status,
  tool_name, input jsonb, output jsonb, evidence jsonb,
  idempotency_key, started_at, ended_at
);
```

### 2.3 Events and Audit

```sql
task_events(
  id pk, user_id fk, task_id fk, run_id fk null, session_id,
  sequence bigint, schema_version int, ts timestamptz,
  source, type, correlation_id, causation_id, payload jsonb,
  unique(task_id, sequence)
);

audit_log(
  id pk, user_id fk, ts timestamptz, actor_type, actor_id,
  task_id, action, resource_type, resource_id,
  decision, reason, metadata jsonb
);
```

### 2.4 Approvals and Receipts

```sql
action_proposals(
  id pk, user_id fk, task_id fk, step_id fk,
  kind, action_hash, risk, status,
  connector_id, target jsonb, args jsonb, preview jsonb,
  idempotency_key, expires_at, decided_at, decided_by,
  decision_reason, created_at
);

action_receipts(
  id pk, user_id fk, proposal_id fk, task_id fk,
  idempotency_key unique, provider, provider_id,
  status, request_hash, response jsonb, error jsonb,
  created_at, verified_at
);
```

### 2.5 Connectors and Secrets

```sql
connectors(
  id pk, user_id fk, provider, account_label,
  status, scopes jsonb, credential_ref, metadata jsonb,
  created_at, updated_at, revoked_at
);

credential_refs(
  id pk, user_id fk, vault_path, kind, created_at, rotated_at, revoked_at
);
```

### 2.6 Browser/Computer/Artifacts

```sql
browser_sessions(
  id pk, user_id fk, task_id fk null, backend, profile_id,
  status, current_url, title, lease_owner, created_at, updated_at
);

artifacts(
  id pk, user_id fk, task_id fk null, run_id fk null,
  kind, name, mime_type, size_bytes, storage_key,
  sha256, metadata jsonb, created_at
);
```

### 2.7 Memory and Skills

```sql
memories(
  id pk, user_id fk, type, content, summary,
  provenance jsonb, confidence numeric, sensitivity,
  embedding vector, created_at, updated_at, deleted_at
);

skills(
  id pk, user_id fk null, name, version, manifest jsonb,
  status, checksum, source, created_at, updated_at
);
```

## 3. Indexing and Constraints

- `tasks(user_id, status, updated_at desc)`
- `task_events(task_id, sequence)` unique.
- `action_receipts(idempotency_key)` unique.
- `action_proposals(user_id, status, expires_at)`
- `memories` vector index (pgvector) + FTS index on content/summary.
- Partial indexes for active leases: `WHERE status='running'`.
- Foreign keys with cascade rules carefully chosen; audit/receipts usually restrict delete.

## 4. Event Types (Canonical)

| Type | Producer | Key payload |
|---|---|---|
| `task.created` | API | task summary |
| `task.plan.updated` | orchestrator | plan steps |
| `task.step.started` | worker | step id/title |
| `tool.proposed` | Hermes | tool, args summary, risk |
| `policy.decided` | policy | allow/deny/ask, reason |
| `approval.requested` | policy | approvalId, preview, hash |
| `approval.resolved` | user/policy | decision, actor |
| `tool.completed` | worker | result ref, receipt |
| `browser.observation` | browser | url/title/screenshotRef |
| `artifact.created` | artifact svc | artifact metadata |
| `task.completed` | orchestrator | outcome, evidence |
| `task.failed` | orchestrator | error code, retryable |

## 5. API Contract (REST v1)

### 5.1 Common Conventions

- Auth: bearer/session cookie.
- Idempotency: `Idempotency-Key` header for POST create/execute endpoints.
- Pagination: `cursor`, `limit`.
- Errors: `{error:{code,message,retryable,details}}`.
- All timestamps ISO 8601 UTC.

### 5.2 Task APIs

```http
POST /v1/tasks
{
  "prompt": "Find flights...",
  "mode": "assistant",
  "threadId": "thr_1",
  "settings": { "model": "auto", "approvalMode": "standard" }
}
```

```http
POST /v1/tasks/:id/control
{ "action": "pause" | "resume" | "cancel" | "retry" }
```

```http
GET /v1/tasks/:id/events?after=42&limit=200
```

### 5.3 Approval APIs

```http
POST /v1/approvals/:id/decision
{
  "decision": "approve" | "deny",
  "actionHash": "sha256:...",
  "reason": "looks good"
}
```

Server rejects if hash mismatch, expired, or already resolved.

### 5.4 Connector APIs

```http
POST /v1/connectors/gmail/connect
POST /v1/connectors/gmail/callback
DELETE /v1/connectors/:id
GET /v1/connectors
```

### 5.5 Browser APIs

```http
POST /v1/browser/sessions
POST /v1/browser/sessions/:id/actions
{
  "type": "navigate|click|type|scroll|extract|screenshot",
  "payload": {}
}
POST /v1/browser/sessions/:id/takeover
POST /v1/browser/sessions/:id/release
```

## 6. WebSocket Event Stream

`WS /v1/ws?taskId=...` or user-scoped stream.

Client messages:
- `subscribe` `{taskId, afterSequence}`
- `ping`
- `unsubscribe`

Server messages:
- `event` (canonical envelope)
- `replay.complete`
- `error`

## 7. Data Retention and Deletion

| Data | Default retention | User control |
|---|---|---|
| Tasks/events | 90 days / configurable | export/delete |
| Audit logs | 1 year (security) | export, limited delete |
| Screenshots/artifacts | 30 days | delete/export |
| Memory | until deleted | inspect/edit/delete/export |
| Secrets | until revoked | disconnect/revoke |

Deletion must cascade to object store and indexes; audit may retain tombstone metadata.

## 8. Migration Strategy

- Use migration tool (Prisma Migrate/Drizzle/Knex/Flyway).
- Backward-compatible event schema changes; additive first.
- Dual-write/dual-read only when necessary, with cutover flag.
- Versioned API responses; deprecation window.

## 9. Acceptance Criteria

- All entities owner-scoped with DB constraints.
- Event replay reconstructs task timeline deterministically.
- Idempotency key uniqueness enforced for external writes.
- Approval decision rejects hash mismatch.
- Deleting connector revokes credentials and disables tools.
- Export includes tasks, artifacts metadata, memory, audit (policy-permitted).



---


# 11 - Implementation Roadmap

## 1. Delivery Strategy

Build in **secure vertical slices**. Each phase produces a runnable increment with tests, observability, and rollback. Do not build broad feature surface before reliable execution core.

## 2. Phase Plan

### Phase 0 - Foundation (Week 1-2)

**Goal:** Repo, contracts, local dev, CI baseline.

- Monorepo scaffold (`apps/web`, `apps/api`, `apps/worker`, `apps/browser-worker`, `packages/shared`).
- TypeScript, lint, test, build, env config, Docker Compose.
- Postgres + migrations + seed.
- Auth skeleton (single-user local session).
- Event envelope schema and logger.

**Exit criteria:**
- `docker compose up` starts core services.
- CI runs lint/typecheck/unit tests.
- Can create and fetch a task record.

### Phase 1 - OpenFUSE-Style UI + Task Core (Week 2-4)

**Goal:** Visible task system with realtime updates.

- Chat UI, task list/detail, timeline.
- Task CRUD/control APIs.
- WS event stream and replay.
- DB lease worker (OpenFUSE pattern).
- Artifact storage abstraction.

**Exit criteria:**
- User creates task from chat and sees live state transitions.
- Refresh/reconnect reconstructs timeline.
- Pause/resume/cancel/retry works.

### Phase 2 - Hermes Runtime Integration (Week 4-6)

**Goal:** Real agent planning/tool proposals.

- Hermes adapter sidecar + health checks.
- Model router (one cloud + one local/OpenAI-compatible).
- Normalized agent events to UI.
- Bounded context builder.
- Tool manifest registry.

**Exit criteria:**
- Same prompt runs through adapter and streams plan/response.
- Two model providers pass contract tests.
- Interrupt stops generation cleanly.

### Phase 3 - Browser Execution + Takeover (Week 6-8)

**Goal:** Real visible browser work.

- Playwright worker service (session, navigate, observe, act, screenshot, download).
- Browser workspace UI with live preview.
- Takeover/return control.
- Deterministic playbook runner v1 (YAML/JSON steps).
- Evidence capture.

**Exit criteria:**
- Agent completes public-site research task with screenshots/sources.
- User takeover/return control works in same session.
- Browser crash reported/recovered safely.

### Phase 4 - Approvals, Vault, and Connectors (Week 8-10)

**Goal:** Safe real-world app actions.

- Policy engine (ALLOW/DENY/ASK_USER).
- Approval center/cards with action hash binding.
- Vault/credential refs.
- Gmail + Google Calendar connectors (read/write split).
- Action receipts and uncertain-outcome handling.

**Exit criteria:**
- Draft/send email flow requires exact approval.
- Changed recipient invalidates approval.
- Disconnect revokes/blocks connector immediately.

### Phase 5 - Temporal Reliability Layer (Week 10-13)

**Goal:** Durable execution for real tasks.

- Temporal dev/prod setup.
- TaskWorkflow with signals/queries.
- Idempotent activity wrappers.
- Schedules for monitors.
- Reconciliation workflow for uncertain writes.

**Exit criteria:**
- Worker kill/restart mid-task: no duplicate side effect.
- Monitor runs across restart with dedupe.
- Uncertain external action reconciled.

### Phase 6 - BrowserOS Deterministic Upgrade (Week 13-15)

**Goal:** Faster deterministic browser path.

- BrowserOS adapter behind BrowserExecutionProvider.
- Capability detection and fallback to Playwright.
- Playbook recorder/import format (initial).
- Performance benchmarking.

**Exit criteria:**
- Supported flows run faster/equal reliability vs Playwright baseline.
- Unsupported capability falls back automatically.

### Phase 7 - Memory, Skills, and Proactivity (Week 15-18)

**Goal:** Personal assistant intelligence over time.

- Memory service with provenance/sensitivity/CRUD/export.
- Skill registry, versioning, test-before-enable.
- Ideas/monitors/goals UI.
- Notification policy (material changes only).

**Exit criteria:**
- User can inspect/edit/delete memory; routing respects sensitivity.
- Skill cannot gain permissions outside policy.
- Proactive notifications deduped and controllable.

### Phase 8 - Hardening and Release (Week 18-20)

**Goal:** Production readiness.

- Security test suite, red-team prompt injection.
- Load/perf tests, SLO dashboards.
- Backup/restore/export.
- Packaging: Docker self-host, desktop Tauri optional.
- Docs/runbooks.

**Exit criteria:**
- All release gates in `12-Testing-Observability-and-Release.md` pass.
- Fresh install completes golden-path scenarios.

## 3. Workstreams

| Workstream | Owns | Parallel from |
|---|---|---|
| Frontend | UI shell, realtime, approvals, workspace | Phase 1 |
| Control plane | API, DB, state machine, events | Phase 0 |
| Agent runtime | Hermes adapter, routing, prompts | Phase 2 |
| Execution | Browser/computer workers, playbooks | Phase 3 |
| Integrations | connectors, OAuth, vault | Phase 4 |
| Reliability | Temporal, idempotency, recovery | Phase 5 |
| Security/QA | threat model, tests, observability | Phase 0 onward |

## 4. Critical Path

1. Data model + event schema + task state machine.
2. Hermes adapter + normalized tool events.
3. Policy/approval + action receipts.
4. Temporal idempotent workflows.
5. BrowserOS optimization (after correctness).

## 5. Cutlines (If Time Is Tight)

**Keep:** chat, tasks, Playwright browser, approvals, Gmail/Calendar, receipts, restart recovery.  
**Cut first:** mobile app, many connectors, generated skills, multi-device hub, advanced memory graph.  
**Never cut:** approval binding, idempotency, audit, secret redaction.

## 6. Team Shape (Minimum)

- 1 full-stack/frontend engineer
- 1 backend/platform engineer
- 1 agent/runtime engineer
- 1 QA/security-minded engineer (can be part-time)

## 7. Definition of Done (Global)

- Feature documented, tested (unit+integration+E2E where relevant).
- Policy/audit/idempotency considered.
- Observable in logs/metrics/traces.
- Failure and recovery behavior defined.
- No secret leakage.
- UI reflects backend truth.



---


# 12 - Testing, Observability, and Release

## 1. Quality Strategy

Test the system as a **real execution platform**, not just a chat app. Coverage must include correctness, safety, reliability, and recovery.

## 2. Test Pyramid

| Layer | Scope | Tools/examples | Gate |
|---|---|---|---|
| Unit | pure logic: state machine, policy, hash, reducers | Vitest/Jest/Pytest | required PR |
| Contract | adapter schemas: Hermes, model, browser, connector | Pact/schema tests | required PR |
| Integration | API + DB + workers + vault mocks | Testcontainers/docker compose | required PR/main |
| E2E | real user flows in UI | Playwright/Cypress | nightly + release |
| Reliability | crash/restart/retry/duplicate signals | chaos scripts, Temporal tests | release |
| Security | prompt injection, SSRF, authz, secrets | ZAP/custom suites | release |
| Eval | agent task success/quality | benchmark scenarios | weekly/release |

## 3. Critical Test Scenarios

### 3.1 Execution Correctness
- Create task -> plan -> tool execution -> completion with evidence.
- Browser task extracts correct data from fixture site.
- Connector read/write with test accounts.

### 3.2 Approvals and Safety
- Send email requires approval; no approval no send.
- Approval hash mismatch rejected.
- Expired approval cannot execute.
- Denied action leaves no external side effect.

### 3.3 Reliability / "No Silent Fail"
- Kill worker during running step -> resume or explicit failed/uncertain.
- Duplicate event/signal delivery -> no duplicate external action.
- Provider timeout after possible send -> uncertain then reconciled.
- Temporal workflow replay produces same decision path.

### 3.4 Browser/Takeover
- Takeover pauses agent; return control resumes with fresh observation.
- Same session ID throughout preview and control.
- Download captured and attributed.

### 3.5 Security
- Prompt injection in web page cannot cause unauthorized tool call.
- SSRF to 127.0.0.1/169.254.169.254 blocked.
- Secrets never appear in logs/events/UI payloads.
- Disconnected connector cannot execute.

## 4. Agent Evaluation Suite

Create benchmark tasks with deterministic fixtures where possible:

| Category | Example | Pass condition |
|---|---|---|
| Research | summarize 3 sources with citations | correct sources, no hallucinated receipt |
| Form fill | complete sandbox form | fields correct, confirmation captured |
| Email | draft reply, wait approval, send test mailbox | approved exact send, receipt stored |
| Scheduling | propose/create calendar event | correct time/timezone, approval if required |
| Recovery | interrupted browser task | resumes or clean partial report |
| Safety | malicious instruction page | policy blocks/ignores |

Metrics: success rate, evidence completeness, human interventions, unsafe action attempts, cost, latency.

## 5. Observability

### 5.1 Logging
- Structured JSON logs.
- Required fields: `ts, level, service, ownerId, taskId, runId, stepId, eventId, correlationId`.
- Redact secrets, tokens, auth headers, PII by rule.

### 5.2 Metrics

| Metric | Type | Alert |
|---|---|---|
| `task_success_total` | counter | success rate drop |
| `task_failure_total{code}` | counter | spike by code |
| `external_write_duplicate_prevented_total` | counter | expected in chaos, investigate in prod |
| `approval_wait_seconds` | histogram | UX/policy issue |
| `tool_latency_seconds{tool}` | histogram | provider degradation |
| `worker_lease_recoveries_total` | counter | crash loop |
| `uncertain_actions_total` | counter | immediate review |

### 5.3 Tracing
- OpenTelemetry spans: API request, orchestrator run, model call, policy decision, tool execution, provider call.
- Propagate trace/correlation IDs into events and audit.

### 5.4 Dashboards
- Task funnel: created -> running -> waiting -> completed/failed.
- Safety: denied actions, approvals, uncertain writes.
- Reliability: retries, recoveries, replay counts.
- Cost: tokens/cost per task/model/provider.

## 6. SLOs (Initial)

| SLO | Target |
|---|---|
| API availability | 99.5% MVP self-host |
| Task state durability | 99.99% persisted before ack |
| Duplicate external side effects | 0 tolerated; incident if >0 |
| Approval enforcement correctness | 100% |
| P95 first progress event | < 3s |

## 7. Release Gates

Release blocked unless all pass:

- [ ] All unit/contract/integration tests green.
- [ ] E2E golden paths green on clean environment.
- [ ] Security suite: no critical/high unresolved findings.
- [ ] Chaos test: crash/restart produces no duplicate external write.
- [ ] Approval hash binding verified.
- [ ] Secrets redaction verified.
- [ ] Backup/restore drill completed.
- [ ] Observability dashboards and alerts configured.
- [ ] Runbooks: incident, rollback, revoke connectors, uncertain action reconciliation.

## 8. Runbooks

- **Uncertain external action:** locate receipt, query provider, mark reconciled, notify user.
- **Provider outage:** circuit break, fallback, mark tasks blocked/retry_scheduled.
- **Secret leak suspicion:** emergency stop, revoke tokens, rotate keys, audit export.
- **Bad deployment:** disable new tasks, drain workers, rollback, replay safe workflows.

## 9. Post-Release Monitoring

- Watch first 24h: failure codes, uncertain actions, approval latency, model costs.
- Sample task traces for correctness.
- Collect user feedback on takeover/approval UX.
- Triage and patch only with regression tests.



---


# 13 - Repository Structure and Tech Stack

## 1. Monorepo Layout

```text
personal-assistant/
├── apps/
│   ├── web/                    # OpenFUSE-style React UI
│   ├── api/                    # Control plane API + WS
│   ├── worker/                 # Task/Temporal activity worker
│   ├── browser-worker/         # Playwright/BrowserOS executor
│   ├── computer-worker/        # Sandbox command/file/desktop
│   └── desktop/                # Optional Tauri shell
├── packages/
│   ├── shared/                 # types, schemas, event contracts
│   ├── db/                     # Prisma/Drizzle schema, migrations
│   ├── policy/                 # Sentinel rules, risk engine
│   ├── connectors/             # connector manifests/adapters
│   ├── model-adapters/         # OpenAI/Anthropic/local/Hermes adapters
│   ├── browser-core/           # BrowserExecutionProvider + playbooks
│   ├── workflows/              # Temporal workflows/activities
│   └── observability/          # logger, otel, redaction
├── infra/
│   ├── docker-compose.yml
│   ├── docker/
│   ├── k8s/                    # optional later
│   └── terraform/              # optional later
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── fixtures/
├── docs/
│   └── adr/
├── .env.example
├── package.json / pnpm-workspace.yaml
└── turbo.json
```

## 2. Recommended Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (Node 22+) | matches OpenFUSE patterns, fast iteration |
| Frontend | React + Vite + Tailwind + Radix/shadcn | OpenFUSE-style UI, accessible |
| State/data | TanStack Query + Zustand | server state + local UI |
| API | Hono or Fastify | lightweight, typed, fast |
| WS/realtime | ws / Socket.IO / SSE | event stream |
| DB | PostgreSQL 16 | durable, relational, pgvector option |
| ORM | Drizzle or Prisma | typed schema/migrations |
| Queue/cache | Redis | pubsub, rate limits, lightweight jobs |
| Durable workflows | Temporal | required for no-silent-fail execution |
| Object storage | MinIO (dev) / S3 | artifacts/screenshots |
| Browser | Playwright + BrowserOS adapter | fallback + deterministic capability |
| Sandbox | Docker | computer worker isolation |
| Auth | Lucia/Auth.js/custom local session | single-user MVP |
| Secrets | Vault/SOPS/OS keychain adapter | no plaintext secrets |
| Observability | OpenTelemetry + Pino + Prometheus/Grafana | traces/metrics/logs |
| Testing | Vitest + Playwright + Testcontainers | full pyramid |
| Monorepo | pnpm + Turborepo | fast builds/caching |

## 3. Key Dependencies

```json
{
  "dependencies": {
    "hono": "...",
    "zod": "...",
    "drizzle-orm": "...",
    "pg": "...",
    "ioredis": "...",
    "@temporalio/client": "...",
    "@temporalio/worker": "...",
    "playwright": "...",
    "pino": "...",
    "@opentelemetry/api": "...",
    "jose": "..."
  }
}
```

## 4. Environment Variables

```env
# Core
NODE_ENV=development
PORT=8787
PUBLIC_URL=http://localhost:8787
DATABASE_URL=postgres://...
REDIS_URL=redis://...
OBJECT_STORE_ENDPOINT=...
OBJECT_STORE_BUCKET=...

# Auth/Security
SESSION_SECRET=...
ENCRYPTION_KEY=...
VAULT_ADDR=...

# Models
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# Hermes
HERMES_URL=http://localhost:8080
HERMES_TOKEN=

# Browser
BROWSER_WORKER_URL=http://localhost:8790
BROWSER_WORKER_TOKEN=

# Temporal
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=assistant-main

# Connectors
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

## 5. Docker Compose (Dev)

Services:
- `postgres`
- `redis`
- `minio`
- `temporal` + `temporal-ui` + `temporal-postgres` (or dev server)
- `api`
- `worker`
- `browser-worker`
- `web`
- `hermes` (sidecar, when available)

## 6. CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
- lint
- typecheck
- unit
- integration (testcontainers)
- build
- e2e (nightly/release)
- security scan (deps/container/sast)
- docker image build/push
```

Release: semantic versioning, changelog, migration check, rollback artifact.

## 7. Coding Standards

- Zod schemas at boundaries; infer TS types.
- No `any` in core contracts.
- All external actions return typed `ActionResult`/receipt.
- Errors mapped to stable codes.
- Redaction middleware mandatory.
- ADR for boundary/security changes.

## 8. Local Dev Quickstart

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis minio temporal
pnpm db:migrate
pnpm dev
# web: http://localhost:5173
# api: http://localhost:8787
# temporal ui: http://localhost:8088
```

## 9. Migration from OpenFUSE Demo

Reusable patterns from `Demo/openfuse`:
- Task domain model and status enums.
- DB lease worker compare-and-swap.
- Action proposal hash/expiry/uncertain outcome handling.
- Browser worker token auth and session preview model.
- Chat inline card UX.

Replace/upgrade:
- PGlite-first -> Postgres-first.
- In-process worker reliability -> Temporal for durable flows.
- Sample/model CopilotKit agent -> Hermes adapter + policy gateway.
- Ad hoc connector logic -> manifest-driven connector workers.
