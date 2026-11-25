# P7a Feedback Emission Coverage Matrix

| Callsite | Kind/Signal | Enabled emit | Disabled no-op | Redaction/no-secret-leak | Uncertain/network | Notes |
|---|---|---:|---:|---:|---:|---|
| `backend/api/src/lib/feedback.ts` | helper | yes (`lib/feedback.test.ts`) | yes | yes | n/a | insert-failure no-throw covered |
| `backend/api/src/routes/approvals.ts:45` | approval_decision +/- | yes (`approvals.feedback.test.ts`) | indirect via helper | yes | n/a | approve+reject covered |
| `backend/api/src/routes/gmail.ts:144` | tool_failure negative/error uncertain network | yes (`gmail.feedback.test.ts`) | n/a | yes | yes | 503 uncertain |
| `backend/api/src/routes/gmail.ts:151` | tool_failure negative warn/error provider fail/uncertain | yes | yes (disabled provider-fail case) | yes | partial | 429/503 uncertain-provider covered in tests; other 5xx classes optional follow-up |
| `backend/api/src/routes/calendar.ts:158` | create uncertain network | yes (`calendar.feedback.test.ts`) | n/a | yes | yes | 503 |
| `backend/api/src/routes/calendar.ts:165` | create provider fail/uncertain | yes | yes | yes | partial | 429/503 covered; other 5xx optional follow-up |
| `backend/api/src/routes/calendar.ts:246` | update uncertain network | yes (`calendar.feedback-update-delete.test.ts`) | n/a | yes | yes | 503 |
| `backend/api/src/routes/calendar.ts:253` | update provider fail/uncertain | yes | n/a | yes | partial | 429/503 covered; other 5xx optional follow-up |
| `backend/api/src/routes/calendar.ts:320` | delete uncertain network | yes (`calendar.feedback-update-delete.test.ts`) | n/a | yes | yes | 503 |
| `backend/api/src/routes/calendar.ts:327` | delete provider fail/uncertain | yes | n/a | yes | partial | 429/503 covered; other 5xx optional follow-up |
| `backend/api/src/routes/browser.ts:151` | tool_failure guardedAct failure | wired (flag-gated helper) | helper yes | helper yes | n/a | user/task/run/receipt correlation available; add dedicated browser feedback test |
| `backend/api/src/routes/browser.ts:289` | tool_failure external-action failure | wired (flag-gated helper) | helper yes | helper yes | n/a | user/task/run/receipt correlation available; add dedicated browser feedback test |
| `backend/api/src/lib/reconciliation.ts:88` | tool_failure resolved executed/failed | yes (`reconciliation.feedback.test.ts`) | yes | yes | n/a | lookup-not-found and lookup-exception assert no emit/no blind retry |
| `backend/worker/src/index.ts:141` | task_outcome positive/negative/neutral on completion | helper-tested (`worker/src/feedback.test.ts`) + integration (`process-task.feedback.test.ts`) | helper yes | helper yes | n/a | emission flag-gated/no-throw |
| `backend/worker/src/index.ts:153` | tool_failure RUNTIME_CRASH | helper-tested + integration (`process-task.feedback.test.ts`) | helper yes | helper yes | n/a | emission flag-gated/no-throw |

## Gaps / Non-emittable by design (current contract)
- Worker loop claim failures (`backend/worker/src/index.ts`) occur before task claim/correlation; cannot emit user-scoped feedback safely without additive system-feedback contract. Loop now logs `worker.claim.error` without fabricating IDs.
- Worker process unexpected catch is defense-in-depth with task/user/run logging; `processTask` owns expected failure/completion feedback. Avoid duplicate feedback unless dedupe contract added.
- Browser-worker (`backend/browser-worker/src/index.ts`, executor) has no DB/feedback dependency; additive correlation contract/propagation/response echo implemented and tested (`backend/browser-worker/src/correlation-echo.test.ts` PASS 2/2, commit `dd4cdc7`). Emitting P7a DB feedback from browser-worker still requires cross-service contract+DB wiring decision. No behavior change.
- Browser guardedAct/external-action failure emissions are wired and route-tested (`browser.feedback.test.ts` PASS 4/4). Keep matrix synced for new callsites.
- See `changes/p7a-feedback-correlation-contract.md` for draft additive correlation contract (no activation).

## P7b memory retrieval/consolidation coverage (related but separate)
- `backend/api/src/routes/memory.ts` retrieval `GET /v1/memory/retrieval` - flag-gated `HELM_MEMORY_RETRIEVAL_ENABLED=1`, user-scoped, bounded scan/limit, audit `memory.retrieval.query`, no auto-delete. Covered by `memory.test.ts`.
- `backend/api/src/routes/memory.ts` consolidation dry-run `GET /v1/memory/consolidation/dry-run` - flag-gated `HELM_MEMORY_CONSOLIDATION_DRY_RUN=1`, reports candidates only, `deleted:0`, `modified:0`, audit `memory.consolidation.dry_run`. Covered by `memory.test.ts`.
- Retention enforcement/delete remains blocked pending explicit approval + dry-run/audit/legal/privacy signoff; no vault-secret deletion.
