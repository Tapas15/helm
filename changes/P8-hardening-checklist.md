# P8 Hardening Checklist

## Scope
P8 covers release hardening: security, reliability, backup/restore, PII/retention, observability, dependency/supply-chain, compliance, and release evidence. This checklist distinguishes **implemented/evidenced** from **operator/legal/manual** blockers.

## Automated / Implemented
- [x] CI green on main: lint/typecheck/build/test (`.github/workflows/ci.yml`).
- [x] Dependency audit runs in CI as report-only (`pnpm audit --audit-level=high`, continue-on-error); triage documented in `changes/P8-dependency-audit-triage.md`.
- [x] Scheduled/manual report-only security scan workflow drafted (`.github/workflows/security-scan.yml`: dependency audit + CodeQL security-extended; no gating; container/secrets pending decision).
- [x] Log redaction baseline in `packages/observability/src/redaction.ts`; regression `packages/observability/src/redaction.test.ts` PASS.
- [x] Task export/delete controls: user-scoped export (`GET /v1/tasks/:id/export`, `POST /v1/tasks/export`, capped by `HELM_TASK_EXPORT_MAX` default 200/hard max 500); delete gated by `HELM_ALLOW_TASK_DELETE=1` + `x-helm-confirm-delete: yes`; transactional delete + audit. Env-gated `task-export-delete-api` PASS. Deterministic route contracts PASS 11/11 (`backend/api/src/routes/tasks.export-delete.test.ts`, 2026-11-26; includes cross-user no-leak/no-mutate and audit/env-secret no-leak characterization).
- [x] Backup/restore scripts hardened: `scripts/backup-db.ps1` emits SHA256; `scripts/restore-db.ps1` requires `-Force`, verifies checksum by default, and warns about artifact/key scope.
- [x] Non-destructive backup/restore dry-run evidence: `changes/P8-backup-restore-dry-run.md` (includes 2026-11-26 safe dry-run checklist; no new destructive drill).
- [x] Runbooks: `changes/RUNBOOK-backup-restore.md`, `changes/RUNBOOK-backup-restore-drill.md`.
- [x] P8 baseline docs: security/privacy, threat model, PII retention baseline/implementation notes, release evidence.

## Manual / Operator / Legal Blocked
- [ ] Full backup/restore drill including artifact dir + vault key scope in staging-like env; record evidence. **Blocked:** ops/manual execution.
- [ ] Encrypted backup storage, retention policy, access controls, scheduled backup + restore verification. **Blocked:** ops/product decision.
- [ ] Dependency audit gating decision (fail CI on high/critical runtime-path vulns?) and remediation cadence. **Blocked:** security/product decision.
- [ ] SAST/secrets/container scan selection and CI gating (CodeQL report-only drafted; Trivy/Gitleaks decision pending). **Blocked:** security/ops decision.
- [ ] Formal STRIDE/threat-model review with signoff; SSRF/command-injection/dependency review pass. **Blocked:** manual security review.
- [ ] PII retention/export/delete policy beyond current task export/delete scaffold; artifact PII classification/redaction; privacy notice/legal text. **Blocked:** product/legal/privacy decision.
- [ ] Compliance/provenance/Dubai submission signoff; third-party notices refresh on dependency changes; organizer IP/promotional terms review. **Blocked:** legal/submission decisions.
- [ ] Chaos/fault matrix execution with evidence (worker kill, DB unavailable, provider 429/5xx, uncertain writes, Temporal outage). **Blocked:** controlled env/operator run.
- [ ] SLO dashboards/alerts, packaging/runbooks/release gates. **Blocked:** ops/product decisions.

## Next Safe Self-Doable Slices
- Add report-only Trivy/Gitleaks workflow after security/ops tool decision (no gating).
- Extend deterministic contract tests for P8 export/delete/redaction: explicit cross-user single-task export 404, audit metadata allowlist (no request body/header echo), and export redaction policy decision (raw-as-stored vs redacted export) with tests once policy chosen.
- Refresh dependency audit table after next lockfile/dependency change with command evidence.
- Refresh CURRENT_STATE/phase-8/SESSION_LOG after each slice with evidence.