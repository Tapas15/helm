# Phase 8 - Hardening / Release

**Status:** `[~]` 46%  
**Blueprint refs:** Phase 8, `12-Testing-Observability-and-Release.md`

## Goal
Production readiness: security, reliability, observability, backup/restore/export, compliance, release gates.

## What we have done
- **CI/release baseline**: CI green with lint/typecheck/build/test and report-only dependency audit. Latest watched green `45815147183` (`696cb8c`).
- **Observability redaction**: Expanded Pino redaction for `sessionToken`, `vaultKey`, `encryptedValue`, `pkceVerifier`, `pkceVerifierEncrypted` and wildcard variants; regression `packages/observability/src/redaction.test.ts` PASS.
- **Backup/restore**: Scripts `scripts/backup-db.ps1`, `scripts/restore-db.ps1` hardened (SHA256 checksum, restore `-Force`, scope warnings). Dry-run evidence in `changes/P8-backup-restore-dry-run.md` (backup `backups/helm-20261124-161337.dump`, restore to temp `helm_restore_test`, `pg_restore` exit 0, 17 tables verified, temp DB dropped, `helm` untouched).
- **Data controls**: Task export endpoints capped by `HELM_TASK_EXPORT_MAX`; delete gated by `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`, transactional delete + audit. Env-gated `task-export-delete-api` PASS (1/1). Deterministic route contract coverage: `backend/api/src/routes/tasks.export-delete.test.ts` PASS 11/11 (2026-11-26) covering export 404/owned/bounded arrays, bulk export cap + cross-user no-leak, delete disabled/missing-confirm/missing-task/cross-user 404 no-mutate, transactional delete+audit, audit metadata no-secret-env leakage, export payload env-secret no-leak characterization.
- **P8 docs/evidence**: Hardening/security/privacy/threat-model/PII/backup-runbook/release-evidence/dependency-audit docs refreshed 2026-11-26 with explicit blockers and safe next slices.
- **Security scan workflow (draft, report-only)**: `.github/workflows/security-scan.yml` adds scheduled/manual dependency audit + CodeQL security-extended; `continue-on-error` / no gating; container/secrets scans pending security/ops decision.

## Checklist

### Completed
- [x] CI green with lint/typecheck/build/test and report-only dependency audit (latest watched `45815147183`).
- [x] Observability redaction expanded for sessionToken/vaultKey/encryptedValue/PKCE verifier; regression test PASS.
- [x] Backup/restore scripts hardened: checksum sidecar on backup; checksum verify + explicit `-Force` on restore; artifact/vault-key scope warnings.
- [x] Backup/restore dry-run evidence: `changes/P8-backup-restore-dry-run.md`.
- [x] Backup/restore runbooks: `changes/RUNBOOK-backup-restore.md`, `changes/RUNBOOK-backup-restore-drill.md`.
- [x] P8 docs/checklists refreshed: hardening, security-privacy, threat-model baseline, PII retention baseline/implementation notes, release evidence, dependency audit triage.
- [x] Task export/delete controls: user-scoped export endpoints capped by `HELM_TASK_EXPORT_MAX`; delete gated by `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`; transactional delete + audit; env-gated integration PASS; deterministic route contract tests PASS 11/11 (`backend/api/src/routes/tasks.export-delete.test.ts`, 2026-11-26, includes cross-user no-leak/no-mutate and audit/env-secret no-leak characterization).
- [x] `.env.example` duplicate Temporal keys removed; P8 controls documented.

### Remaining / Blocked
- [ ] Full backup/restore drill including artifacts/vault-key scope, encrypted/retention/scheduled verification. **Blocked:** ops/manual evidence.
- [ ] CI security scan triage/gating decisions (dependency audit report-only; CodeQL report-only workflow drafted 2026-11-26; no SAST/secrets/container gating). **Blocked:** product/security decision.
- [ ] Formal STRIDE/threat-model execution/signoff and incident/key-rotation runbook. **Blocked:** manual security review.
- [ ] PII retention/export/delete policy + implementation beyond task scaffold; artifact PII classification/redaction; privacy notice. **Blocked:** product/legal/privacy decision.
- [ ] Compliance/provenance/Dubai submission signoff; third-party notices refresh on dep changes. **Blocked:** legal/submission decisions.
- [ ] Chaos/fault matrix, SLO dashboards/alerts, packaging/docs/runbooks/release gates. **Blocked:** ops/manual/product decisions.

## Evidence
- CI: [45815147183](https://github.com/Tapas15/helm/actions/runs/45815147183) PASS (`696cb8c`); [45812802322](https://github.com/Tapas15/helm/actions/runs/45812802322) PASS (`f06c50a`).
- `packages/observability/src/redaction.test.ts` PASS.
- Env-gated `task-export-delete-api` PASS (1/1) when enabled.
- Deterministic task export/delete route contracts: `backend/api/src/routes/tasks.export-delete.test.ts` PASS 11/11 (2026-11-26).
- `changes/P8-backup-restore-dry-run.md`, `changes/P8-dependency-audit-triage.md`, `changes/P8-threat-model-baseline.md`.
