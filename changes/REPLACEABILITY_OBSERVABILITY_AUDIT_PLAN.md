# Replaceability, Observability, Debug Trace, and Fix-Audit Plan

> Cross-cutting requirements for all Helm phases. Read with `README.md`, `CURRENT_STATE.md`, and active phase doc.

## 1) Replaceable Technology (change later without rewrite)

**Goal:** Any underlying technology can be swapped with bounded cost.

| Layer | Swap target | Contract boundary | Migration rule |
|---|---|---|---|
| Model/provider | OpenAI/Anthropic/local/vLLM/Ollama | `packages/shared` model adapter contract | No app code calls provider SDK directly |
| Agent runtime | Hermes sidecar/service/embedded | `AgentRuntime` interface | Normalize events before control plane |
| Browser backend | Playwright/BrowserOS/CDP | `BrowserExecutionProvider` | Capability detection + fallback |
| Queue/durable engine | DB lease worker -> Temporal | Task/workflow interfaces | Keep task state schema stable; adapter swap |
| DB/ORM | Drizzle/Postgres now; later possible | repository/service layer | Domain schemas/events canonical; migration ADR required |
| UI framework/libs | React/Vite now | API/event contracts | UI consumes canonical events/API only |
| Connectors/MCP/sandbox | per provider | connector manifest + policy gate | no direct secret access; typed inputs/outputs |

**Rules**
- Contracts first in `packages/shared` (Zod schemas, event envelope, task/approval/receipt/error shapes).
- Apps/packages depend on interfaces, not vendor SDK types, outside adapter modules.
- Every technology swap requires ADR in `changes/DECISIONS.md` or `docs/adr/`, migration plan, rollback, and verification evidence.
- No direct cross-app imports; use packages/contracts.

## 2) Debugging, Print/Log Statements, Agent Trace

**Goal:** In dev, developers/agents can see exactly what happened; in prod, logs are structured, redacted, and auditable.

### Logging policy
- **Prod/runtime:** Pino structured JSON logs only. No raw `console.log` in production paths.
- **Dev debug:** allowed behind flags (`LOG_LEVEL=debug`, `HELM_DEBUG=1`, `HELM_TRACE_AGENT=1`); use logger debug/trace, not ad-hoc prints. Temporary print statements must be removed before merge or guarded by debug flag.
- **Redaction mandatory:** tokens, passwords, apiKey, authorization, cookie, secret, credential, PII as configured.

### Required trace fields (every log/event where applicable)
`ts, level, service, env, version, requestId, correlationId, causationId, taskId, runId, stepId, sessionId, userId, agentId, tool, action, eventId, sequence`.

### Agent trace
- Emit trace events for: plan created/updated, tool proposed, policy decision, approval requested/resolved, tool started/progress/completed/failed, checkpoint saved, takeover start/end, retry scheduled, failure diagnosed, fix proposed/applied/verified.
- Store agent trace as `task_events` (canonical) plus debug logs; UI can render timeline from events.
- Agent trace must include rationale summary, inputs summary (redacted), output summary, duration, error/cause when failed.

## 3) Stress / Failure / Root-Cause Error Reporting

**Goal:** No silent failures. Every failure is visible, diagnosable, and reproducible.

### Error contract
```ts
type HelmError = {
  code: string;            // stable, e.g. TASK_DB_WRITE_FAILED
  message: string;         // safe, user-readable
  retryable: boolean;
  cause?: HelmError;       // chained cause
  context?: Record<string, unknown>; // redacted diagnostic snapshot
  traceId?: string;
  correlationId?: string;
  taskId?: string;
  stepId?: string;
};
```

### Failure reporting requirements
- Capture: error code, message, stack (logs only, not user-facing unless safe), cause chain, request/correlation IDs, task/run/step IDs, component, operation, elapsed ms, retry attempt, input shape (redacted), external provider response metadata (redacted).
- Persist failure on task/step: `errorCode`, `errorMessage`, `errorDetails` (redacted JSON), `failedAt`.
- Emit `task.failed` / `tool.failed` / `system.error` events with evidence refs.
- Classify: validation, policy_denied, auth, timeout, provider_5xx, rate_limit, conflict, uncertain_external_write, invariant_violation, unknown.

### Stress/debug tooling (planned)
- Fault injection flags for dev/test: DB timeout, worker crash, duplicate event, provider 500, uncertain write.
- Chaos scripts in `tests/reliability/`.
- Load test critical paths: task create, event replay, worker claim, approval decision.
- "Debug bundle" export for a task: redacted events, logs, receipts, state transitions, versions.

## 4) Agent-Assisted Fix Workflow (tracked + audited)

**Goal:** Agent can help diagnose and fix problems, but every fix is traceable.

### Fix lifecycle
1. **Detect** - failure event/alert/test failure/manual report.
2. **Diagnose** - agent produces root-cause hypothesis with evidence (logs/events/trace/code refs).
3. **Propose** - fix plan: scope, files, risk, tests, rollback.
4. **Approve if needed** - risky/prod/destructive changes require human approval/policy gate.
5. **Apply** - patch/code/config change; link to task/incident.
6. **Verify** - rerun failing test/smoke; add regression test.
7. **Record** - append to `changes/FIX_LOG.md` and emit audit/event.

### Fix record (required)
```md
## FIX-YYYYMMDD-<slug>
- Date:
- Reporter: user/agent/ci/monitor
- Severity: low|medium|high|critical
- Symptom:
- Root cause:
- Evidence: logs/events/trace/test output refs
- Fix applied: files/commands/PR/commit
- Verification: commands + pass/fail
- Regression test:
- Risk/rollback:
- Audit/event IDs:
- Status: open|mitigated|fixed|verified
```

### Audit requirements
- Audit log entry for: fix proposed, fix applied, fix verified, fix rolled back.
- Include actor (`user`/`agent`/`ci`), task/incident ID, affected resources, diff summary/ref, verification result.
- Never auto-apply high-risk fixes without explicit approval.
- Agent-generated fixes must be distinguishable in audit metadata (`actorType=agent`, `agentId`, `model`, `sessionId`).

## 5) Immediate Backlog (apply starting Phase 0/1)

- [ ] Add `packages/observability` or `backend/api/src/lib` helpers: logger, trace context, error serializer, redaction.
- [ ] Add request/correlation ID middleware to all services.
- [ ] Add `HelmError`/error-code map in shared package.
- [ ] Add `task.failed`/`system.error` event emission path.
- [ ] Add `changes/FIX_LOG.md` and require updates for non-trivial fixes.
- [ ] Add debug bundle/export endpoint (Phase 1+).
- [ ] Add fault-injection hooks guarded by `HELM_TEST_FAULTS=1` (test/dev only).
- [ ] Add regression test requirement for every verified fix.

