# Helm API Surface

The backend currently exposes **91 HTTP route handlers** across `backend/api/src/routes/*.ts` (excluding `*.test.ts`).

> Count method: `app.get/post/put/delete/patch/all(...)` in `backend/api/src/routes/*.ts`, excluding `*.test.ts`. This counts route handlers, not separate HTTP methods hidden behind one handler. It excludes the WS upgrade handler in `backend/api/src/index.ts`; `/health` is defined in `index.ts`.

| Route module | Handlers | Base path / purpose |
|---|---:|---|
| `tasks.ts` | 10 | `/v1/tasks` - task CRUD/control/messages/events/export/delete |
| `browser.ts` | 16 | `/v1/browser` - sessions, navigate/click/fill/screenshot/snapshot, takeover, artifacts, external actions |
| `memory.ts` | 12 | `/v1/memory` - notes, export, retrieval, consolidation/retention dry-runs, audit |
| `feedback.ts` | 9 | `/v1/feedback` - feedback events, eval cases, draft proposals |
| `proactivity.ts` | 5 | `/v1/proactivity` - rules, status, dry-run |
| `connectors.ts` | 5 | `/v1/connectors` - connector catalog, accounts, OAuth start/callback/revoke |
| `identity.ts` | 6 | `/v1/identity` - identities, policy, connector binding |
| `skills.ts` | 4 | `/v1/skills` - skill registry (flag-gated) |
| `calendar.ts` | 4 | `/v1/connectors/calendar` - events list/create/update/delete |
| `gmail.ts` | 2 | `/v1/connectors/gmail` - messages list/send |
| `approvals.ts` | 2 | `/v1/approvals` - list/resolve approvals |
| `reconciliation.ts` | 4 | `/v1/reconciliation` - status/schedule/run/dry-run |
| `connector-accounts.ts` | 2 | `/v1/connectors/accounts` - status/test |
| `runtime.ts` | 2 | `/v1/runtime` - config/model validation |
| `auth.ts` | 3 | `/v1/auth` - sessions/me/revoke |
| `evidence.ts` | 4 | `/v1/artifacts`, `/v1/receipts` - evidence download/reconcile |
| `events.ts` | 1 | `/v1/events/stream` - SSE event stream |
| `index.ts` | 0 (mounts) | mounts routes; also exposes `/health` and browser WS upgrade proxy |
