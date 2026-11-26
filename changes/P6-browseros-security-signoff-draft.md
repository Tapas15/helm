# P6 BrowserOS Security / PII / CI Gate Signoff Draft

**Status:** Draft for review/signoff (not approved)  
**Date:** 2026-11-26  
**Scope:** Helm Phase 6 BrowserOS external MCP adapter (`BROWSEROS_MCP_URL`, default dispatch OFF)  
**Related:** `phase-6-browseros-upgrade.md`, `P8-threat-model-baseline.md`, `P8-pii-retention-baseline.md`

## 1) Decision Summary

| Item | Current state | Required for dispatch gate | Owner | Signoff |
|---|---|---|---|---|
| AGPL boundary | External runtime only; no copied BrowserOS code | Keep boundary; no vendored AGPL code | Engineering | [ ] |
| Endpoint policy | http/https validated; non-loopback blocked unless `HELM_BROWSEROS_ALLOW_REMOTE=1` | Confirm acceptable for target deployment; explicitly decide "non-loopback not used" or verify TLS/auth/allowlist/no vault secrets in BrowserOS runtime | Security/Ops | [ ] |
| PII/artifact retention | Artifacts in `BROWSER_ARTIFACT_DIR`; interim manual caution | Formal retention/redaction/access/deletion policy | Security/Legal/Privacy | [ ] |
| Credential handling | No Helm vault secrets sent by adapter; sensitive fills approval-gated | Verify BrowserOS runtime stores no Helm vault secrets; remote TLS/auth if used | Security/Ops | [ ] |
| BrowserOS CI gate | Local env-gated smoke only; GH-hosted has no BrowserOS | Choose required/optional/manual evidence model | Engineering/Ops | [ ] |
| Default dispatch | `HELM_BROWSER_ADAPTER_DISPATCH` OFF | Explicit written approval after parity+security+CI evidence | Product/Engineering | [ ] |

## 2) STRIDE Threat Model (Draft)

| Threat | Asset/Surface | Risk | Current mitigation | Evidence | Gap / Action | Owner |
|---|---|---|---|---|---|---|
| Spoofing | BrowserOS MCP endpoint identity | Malicious endpoint impersonation | URL validation; loopback default; remote opt-in flag | `browser-adapter.ts`, adapter tests | Non-loopback TLS/auth/allowlist verification if remote used | Ops/Security |
| Tampering | MCP responses/artifacts | False success/artifact mismatch | Structured error mapping; artifact sha256/size/mime; DB-canonical receipts in Helm routes | adapter + route contract tests | Deep real-flow parity vs Playwright | Engineering |
| Repudiation | Browser actions/takeover | Missing audit trail | Helm audit/task events/receipts on guarded actions/takeover | route tests | Real-browser takeover event evidence capture | Engineering |
| Information disclosure | URLs/selectors/fill values/page text/screenshots | PII/secret exposure to local external runtime/artifacts | No vault-secret send by design; approval-gated sensitive fills; no-secret route error assertions; cache-control no-store on screenshot route | `browser.ts`, `binary-error-mapping.test.ts` | Formal PII retention/redaction/deletion; artifact access controls | Security/Privacy |
| Denial of service | MCP timeout/unavailable | Agent/browser flow hangs/fails | Timeout config, structured retryable errors, no blind retry in uncertain external writes | executor/adapter tests, smoke | CI flake/runtime policy; timeout budgets per environment | Ops |
| Elevation of privilege | Dispatch/remote endpoint misuse | Unapproved external control or data egress | Dispatch OFF default; remote guard; Helm authZ/ownership checks before proxy | `browser.ts`, dispatch tests | Formal deployment policy + explicit dispatch approval | Product/Security |

## 3) PII / Retention / Redaction (Draft)

| Data class | Source | Stored where | Default today | Required policy decision | Signoff |
|---|---|---|---|---|---|
| Screenshot PNG | BrowserOS snapshot/screenshot | `BROWSER_ARTIFACT_DIR` + DB metadata row | Stored; no auto-delete | Retention window, access roles, deletion job/process | [ ] |
| DOM snapshot/text | snapshot/external evidence | `BROWSER_ARTIFACT_DIR` + DB metadata | Stored; no auto-delete | Redaction/minimization; PII classification | [ ] |
| URL/title/selector/fill values | tool args/page context | BrowserOS runtime; Helm events/audit where emitted | Approval-gated for sensitive guarded flows | Confirm no secrets/PII in logs/events; redact rules | [ ] |
| Vault secrets/tokens | Helm vault/connectors | Helm encrypted vault/DB refs | Must not be sent to BrowserOS | Verify runtime/process isolation in deployment | [ ] |

**Required controls before signoff**
- [ ] Retention window defined (e.g., N days) and approved.
- [ ] Deletion procedure documented (manual/automated), audited, and tested as dry-run report first.
- [ ] Access control: who can read `BROWSER_ARTIFACT_DIR` and DB artifact rows.
- [ ] Redaction/minimization: screenshots/snapshots may contain PII; define handling.
- [ ] No vault secret/token values in logs/events/artifact metadata.

## 4) BrowserOS CI Gate Decision (Draft)

| Option | Description | Pros | Cons | Required owner decision |
|---|---|---|---|---|
| A. Required self-hosted gate | Self-hosted runner with BrowserOS installed; env-gated smoke required | Strongest evidence | Runner maintenance, flake risk | Approve runner owner/SLA |
| B. Optional env-gated + manual release evidence | Smoke job optional/manual; release checklist requires local/controlled evidence | Low CI risk | Weaker automated gate | Approve release checklist owner |
| C. Manual only | No CI job; evidence captured in `changes/` | Simple now | No CI regression signal; dispatch stays OFF | Accept risk explicitly |

**Recommended minimum**: Option B now, move to A before default dispatch enablement.

## 5) Evidence Checklist

- [ ] Env-gated BrowserOS MCP smoke PASS (controlled local page, no external side effects).
- [ ] Targeted deterministic browser contract suite PASS + typecheck PASS.
- [ ] Real-browser takeover manual evidence captured (recording/logs/API/event rows).
- [ ] Artifact/PII retention policy approved.
- [ ] STRIDE/threat-model signoff recorded with date/owner.
- [ ] CI gate option selected and implemented/documented.
- [ ] Explicit written approval: keep dispatch OFF or enable by controlled rollout.

## 6) Deployment Decisions (Required)

| Decision | Options | Selected | Owner | Date | Notes |
|---|---|---|---|---|---|
| Non-loopback BrowserOS endpoint | **Not used (keep guard, default)** / Used with TLS+auth+allowlist+vault-secret verification | Pending | Ops/Security |  | If "Not used", keep `HELM_BROWSEROS_ALLOW_REMOTE` unset/!=1. |
| BrowserOS CI gate | A required self-hosted / B optional env-gated + manual release evidence / C manual only | Pending | Engineering/Ops |  | Recommended B now, A before default dispatch. |
| Default dispatch | Keep OFF / Controlled rollout after gates | Keep OFF (default) | Product/Engineering |  | Change only after parity+security+CI evidence + explicit approval. |

## 7) Signoff

| Role | Name | Date | Decision | Notes |
|---|---|---|---|---|
| Engineering |  |  | Pending |  |
| Security |  |  | Pending |  |
| Privacy/Legal |  |  | Pending |  |
| Product/Ops |  |  | Pending |  |