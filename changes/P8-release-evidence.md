# P8 Release Evidence

## Automated Evidence
- CI workflow: `.github/workflows/ci.yml` runs lint/typecheck/build/test on push/PR; dependency audit report-only (`pnpm audit --audit-level=high`, continue-on-error).
- Latest watched green CI (user-reported): [45715144160](https://github.com/Tapas15/helm/actions/runs/45715144160) (`4a9b458`, 2026-11-25) PASS.
- Prior green: [45614969597](https://github.com/Tapas15/helm/actions/runs/45614969597) (`7bf214c`).
- Observability redaction regression: `packages/observability/src/redaction.test.ts` PASS (included in normal test runs).
- Task export/delete env-gated integration: `task-export-delete-api` PASS (1/1) when enabled.
- P7b/P3 contract suites reported green in recent slices: memory routes PASS 24/24; browser artifact/takeover/feedback suites PASS (see `CURRENT_STATE.md` / `SESSION_LOG.md`).

## Backup/Restore Evidence
- Dry-run (non-destructive): `changes/P8-backup-restore-dry-run.md` — backup `backups/helm-20261124-161337.dump`, restore to temp `helm_restore_test`, `pg_restore` exit 0, 17 tables verified, temp DB dropped, `helm` untouched.
- Scripts hardened: `scripts/backup-db.ps1` writes SHA256; `scripts/restore-db.ps1` verifies checksum by default and requires `-Force`.
- Runbooks: `changes/RUNBOOK-backup-restore.md`, `changes/RUNBOOK-backup-restore-drill.md`.

## Security/Privacy Evidence
- Redaction config covers secrets/tokens/auth/cookie/vault/PKCE fields.
- Task delete disabled by default; explicit flag + confirm header + audit.
- Memory/retention/consolidation dry-runs report-only; no auto-delete.

## Manual / External Evidence Still Required
- [ ] Full backup/restore drill including artifacts + vault key scope (staging-like), recorded checksums/counts/operator.
- [ ] Encrypted backup storage/retention/access controls/scheduled verification.
- [ ] Dependency/SAST/secrets/container scan gating decision and remediation evidence.
- [ ] Formal STRIDE/threat-model signoff and incident response/key rotation runbook.
- [ ] PII retention/export/delete/legal privacy signoff; artifact PII handling.
- [ ] Chaos/fault matrix evidence (worker kill, DB unavailable, provider 429/5xx, uncertain writes, Temporal outage).
- [ ] Compliance/provenance/Dubai submission signoff; third-party notices refresh on dependency changes.

## Compliance Notes
- `LICENSE`, `THIRD_PARTY_NOTICES.md` present; refresh notices after dependency changes.
- No AGPL/copyleft vendoring; BrowserOS external runtime only, dispatch default off.
