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

## Gaps
- Missing disabled/no-op assertions for calendar update/delete provider-failure and all uncertain-network route tests except gmail provider-fail? Need explicit disabled checks for uncertain-network paths.
- Explicit provider-uncertain 429 assertions added for gmail send and calendar create/update/delete (redacted, uncertain=true, no token leak).
- No worker/runtime tool_failure emissions yet (P7a broader coverage).


