## 2026-11-23 - P8 minimum hardening checklist (thin slice)

- [x] Temporal rollback/runtime evidence recorded (stub/real-dedupe/mock-side-effect/rollback E2E).
- [x] Fix-log discipline maintained for non-trivial fixes.
- [ ] Backup/restore drill (Postgres + artifact dir + vault keys) - not executed.
- [ ] Chaos/fault injection matrix (worker kill, DB unavailable, provider 429/5xx, uncertain writes) - partial.
- [ ] Privacy/retention/PII redaction audit - partial (redaction exists; policy/retention/deletion missing).
- [ ] Security review (authz, secrets, dependency scan, SSRF/command injection) - partial.
- [ ] Release/compliance package (provenance, submission IP, third-party notices review) - pending.
