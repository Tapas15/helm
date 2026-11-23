# P8 Release Evidence (thin slice)

## Automated evidence present
- CI workflow: lint/typecheck/test/build (`.github/workflows/ci.yml`).
- Temporal proofs: routing stub PASS, real dedupe PASS, mock side-effect/worker-restart PASS, rollback runtime PASS.
- Approval/idempotency regressions: task lifecycle, SSE, browser recovery/ownership API tests (env-gated).

## Manual/operator evidence still required
- Backup/restore drill executed on real data snapshot.
- Threat model/security review and dependency scan triage.
- PII retention/export/delete flow.
- Real Google OAuth E2E (external creds).
- Real provider Temporal no-duplicate proof (external sandbox).

## Submission/compliance
- THIRD_PARTY_NOTICES present; LICENSE present.
- No provable provenance/legal signoff recorded in repo.
