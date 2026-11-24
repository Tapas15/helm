# Phase 8 - Hardening / Release

**Status:** `[~]` 43%  
**Blueprint refs:** Phase 8, `12-Testing-Observability-and-Release.md`

## Goal
Production readiness: security, reliability, observability, backup/restore/export, compliance, release gates.

## What we have done
- **CI/release baseline**: CI green with lint/typecheck/build/test and report-only dependency audit. Latest green `45441229198` (`8471aef`), prior `45438392752` (`e6f79d4`).
- **Observability redaction**: Expanded Pino redaction for `sessionToken`, `vaultKey`, `encryptedValue`, `pkceVerifier`, `pkceVerifierEncrypted` and wildcard variants; regression `packages/observability/src/redaction.test.ts` PASS (1/1).
- **Backup/restore**: Scripts `scripts/backup-db.ps1`, `scripts/restore-db.ps1`; dry-run evidence in `changes/P8-backup-restore-dry-run.md` (backup `backups/helm-20261124-161337.dump`, restore to temp `helm_restore_test`, `pg_restore` exit 0, 17 tables verified, temp DB dropped, `helm` untouched).
- **Data controls**: Task export endpoints capped by `HELM_TASK_EXPORT_MAX`; delete gated by `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`, transactional delete + audit. Env-gated `task-export-delete-api` PASS (1/1).
- **P8 docs/evidence**: Hardening, security/privacy, threat-model baseline, PII retention baseline/implementation notes, release evidence, dependency audit triage; `.env.example` documents P8 controls.

## Checklist

### Completed
- [x] CI green with lint/typecheck/build/test and report-only dependency audit (`45441229198` latest).
- [x] Observability redaction expanded for sessionToken/vaultKey/encryptedValue/PKCE verifier; regression `packages/observability/src/redaction.test.ts` PASS.
- [x] Backup/restore scripts: `scripts/backup-db.ps1`, `scripts/restore-db.ps1`.
- [x] Backup/restore dry-run evidence: `backups/helm-20261124-161337.dump`, restore to temp `helm_restore_test`, `pg_restore` exit 0, 17 tables verified, temp DB dropped, `helm` not overwritten (`changes/P8-backup-restore-dry-run.md`).
- [x] P8 docs/checklists: hardening, security-privacy, threat-model baseline, PII retention baseline/implementation notes, release evidence, dependency audit triage.
- [x] Task export/delete controls: user-scoped export endpoints capped by `HELM_TASK_EXPORT_MAX`; delete gated by `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`; transactional delete + audit; env-gated integration PASS (1/1).
- [x] `.env.example` documents P8 controls.

### Remaining / Blocked
- [ ] Full backup/restore drill including artifacts/vault-key scope, encrypted/retention/scheduled verification. **Blocked:** ops/manual evidence.
- [ ] CI security scan triage/gating decisions; dependency audit currently report-only. **Blocked:** product/security decision.
- [ ] Threat-model execution/evidence. **Blocked:** manual review.
- [ ] PII retention/export/delete policy + implementation decisions beyond task export/delete scaffold. **Blocked:** product/legal decision.
- [ ] Compliance/provenance/Dubai submission signoff; organizer promotional-rights/IP text; third-party notices refresh on dep changes. **Blocked:** legal/submission decisions.
- [ ] Chaos/fault matrix, SLO dashboards/alerts, packaging/docs/runbooks/release gates.

## Evidence
- CI: `45438392752` PASS, `45441229198` PASS.
- `pnpm --filter @helm/observability test` PASS (1/1).
- `HELM_TASK_EXPORT_DELETE_API_TEST=1 ... task-export-delete-api` PASS (1/1).
- `changes/P8-backup-restore-dry-run.md`, `changes/P8-dependency-audit-triage.md`, `changes/P8-threat-model-baseline.md`.
