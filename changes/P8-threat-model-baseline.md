# P8 Threat Model Baseline

## Status
Baseline checklist for release hardening. Not a formal security signoff.

## Assets
- Vault-encrypted connector secrets, OAuth tokens/PKCE verifiers.
- Session tokens (hashed in DB), auth/session cookies/headers.
- Task/event/message/audit/receipt data (DB-canonical).
- Browser artifacts/screenshots/state (may contain PII/secrets).
- Backup dumps and restore artifacts (contain sensitive DB data).

## Trust Boundaries
- Web client <-> API (auth, CORS, input validation).
- API <-> DB/Redis/Object store.
- API <-> worker/browser-worker (internal tokens, network boundary).
- API <-> Temporal (optional external-write routing).
- API/worker <-> external providers (Google, LLM providers, BrowserOS MCP endpoint).
- Model/tool output -> runtime/policy boundary (untrusted input).

## Key Threats / Current Mitigations / Gaps

| Threat | Current mitigation | Gap / owner |
|---|---|---|
| Prompt injection / tool abuse | Model proposes, policy decides; approval+actionHash+idempotency for external writes; tool allowlists | Formal adversarial eval/prompt-injection suite; ops/security |
| Secret/token leakage | Vault encryption; Pino redaction; no raw OAuth token persistence in logs; env placeholders | Secret scan in CI; key rotation/runbook; ops/security |
| AuthZ bypass / IDOR | Session-token auth, ownership checks, WS auth, legacy unbound browser hard-block | Full route audit; automated authz tests; engineering |
| Duplicate external side effects | Idempotency keys, receipts, uncertain reconciliation, no blind retry | Real-provider uncertain/no-duplicate evidence depth; P4/P5 |
| SSRF/private-network abuse | Guarded routes/allowlists where implemented; BrowserOS remote endpoint default off | Formal SSRF review; egress allowlist policy; security |
| Command injection / unsafe shell | No shell from untrusted web input in core routes; scripts are operator-run | SAST/command-injection review; security |
| Backup data exposure | Dry-run uses local dump; restore requires explicit `-Force`; checksum added | Encrypted backup storage/access controls/retention; ops/legal |
| Artifact PII leakage | Artifacts treated sensitive; ownership-checked listing excludes path | PII classification/redaction/retention policy; product/legal |
| Supply chain / dependency vulns | Lockfile, CI, report-only `pnpm audit`; triage doc | Gating decision, SAST/container scan, remediation cadence; security |
| AGPL boundary (BrowserOS) | External runtime only; no vendored BrowserOS code; dispatch default off | Legal/compliance signoff if distribution model changes; legal |

## Required Manual Signoff
- [ ] Formal STRIDE review and evidence.
- [ ] Security scan gating decision (dep audit/SAST/secrets/container).
- [ ] Incident response/runbook and key rotation procedure.
- [ ] PII retention/redaction/legal privacy review.
