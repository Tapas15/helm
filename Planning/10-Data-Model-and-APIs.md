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
