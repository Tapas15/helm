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
