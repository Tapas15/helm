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
