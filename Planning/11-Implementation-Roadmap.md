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
