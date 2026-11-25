# P7a Feedback Emission Coverage Matrix

| Callsite | Kind/Signal | Enabled emit | Disabled no-op | Redaction/no-secret-leak | Uncertain/network | Notes |
|---|---|---:|---:|---:|---:|---|
| `backend/api/src/lib/feedback.ts` | helper | yes (`lib/feedback.test.ts`) | yes | yes | n/a | insert-failure no-throw covered |
| `backend/api/src/routes/approvals.ts:45` | approval_decision +/- | yes (`approvals.feedback.test.ts`) | indirect via helper | yes | n/a | approve+reject covered |
| `backend/api/src/routes/gmail.ts:144` | tool_failure negative/error uncertain network | yes (`gmail.feedback.test.ts`) | n/a | yes | yes | 503 uncertain |
| `backend/api/src/routes/gmail.ts:151` | tool_failure negative warn/error provider fail/uncertain | yes | yes (disabled provider-fail case) | yes | provider-uncertain path covered by status logic? partial | no explicit 429/5xx uncertain-provider assertion |
| `backend/api/src/routes/calendar.ts:158` | create uncertain network | yes (`calendar.feedback.test.ts`) | n/a | yes | yes | 503 |
| `backend/api/src/routes/calendar.ts:165` | create provider fail/uncertain | yes | yes | yes | partial | no explicit 429/5xx uncertain-provider assertion |
| `backend/api/src/routes/calendar.ts:246` | update uncertain network | yes (`calendar.feedback-update-delete.test.ts`) | n/a | yes | yes | 503 |
| `backend/api/src/routes/calendar.ts:253` | update provider fail/uncertain | yes | n/a | yes | partial | no explicit 429/5xx uncertain-provider assertion |
| `backend/api/src/routes/calendar.ts:320` | delete uncertain network | yes (`calendar.feedback-update-delete.test.ts`) | n/a | yes | yes | 503 |
| `backend/api/src/routes/calendar.ts:327` | delete provider fail/uncertain | yes | n/a | yes | partial | no explicit 429/5xx uncertain-provider assertion |
| `backend/api/src/lib/reconciliation.ts:88` | tool_failure resolved executed/failed | yes (`reconciliation.feedback.test.ts`) | yes | yes | n/a | lookup-not-found and lookup-exception assert no emit/no blind retry |
| `backend/worker/src/index.ts:141` | task_outcome positive/negative/neutral on completion | helper-tested (`worker/src/feedback.test.ts`) | helper yes | helper yes | n/a | route/runtime integration assertion not yet added; emission flag-gated/no-throw |
| `backend/worker/src/index.ts:153` | tool_failure RUNTIME_CRASH | helper-tested (`worker/src/feedback.test.ts`) | helper yes | helper yes | n/a | runtime-crash integration assertion not yet added; emission flag-gated/no-throw |

## Gaps / Non-emittable by design (current contract)
- Worker loop catch (`backend/worker/src/index.ts:182`) logs infra/claim failures without `userId/taskId/runId`; cannot emit user-scoped feedback safely without contract change. No behavior change.
- Browser-worker (`backend/browser-worker/src/index.ts`, executor) has no DB/feedback dependency and no task/run correlation in HTTP/WS contract; emitting P7a feedback requires cross-service contract+DB wiring decision. No behavior change.
- Worker emissions wired and integration-tested (`process-task.feedback.test.ts` PASS 3/3); keep matrix synced for new callsites.
- 5xx uncertain-provider assertions covered (503); other 5xx classes optional follow-up.





