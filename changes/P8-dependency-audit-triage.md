# P8 Dependency Audit Triage

**Date:** 2026-11-26 (baseline refreshed; prior run 2026-11-24)  
**Command:** `pnpm audit --audit-level=high`  
**CI:** report-only (`continue-on-error: true`) in `.github/workflows/ci.yml`.

## Policy
- CI keeps report-only audit until high/critical runtime-path vulns are triaged/fixed or explicitly accepted by security/product decision.
- No blind major bumps. Patch/minor dependency fixes go in a dedicated change with lint/typecheck/test/build evidence.
- Re-run after dependency refresh and update this file with date, counts, affected paths, and disposition.

## Known Findings (2026-11-24 baseline)
| Package | Severity | Advisory | Path | Helm exposure | Action |
|---|---|---|---|---|---|
| `flatted <3.4.0` | High | GHSA-rf6f-7fwh-wjgh (unbounded recursion DoS in parse) | dev/tooling (`eslint>file-entry-cache>flat-cache>flatted`) | Dev/lint only, not runtime | Accept temporarily; bump eslint chain in scheduled deps update; keep report-only. |
| `undici` ranges | Moderate | GHSA-4992-7rv2-5pvq, GHSA-f269-vfmq-vjvj (CRLF/request smuggling) | transitive via `@temporalio/*` | Runtime-adjacent for Temporal client/worker HTTP | Track upstream; avoid untrusted CR/LF in headers/paths; schedule upgrade+tests. |
| `@xmldom/xmldom <0.8.12` | Moderate | GHSA-xf2r-c6m6-7rw4 | transitive via `@azure/*` | Low; no direct Helm XML parse path | Track upstream; no direct usage. |
| `yaml` vulnerable ranges | Moderate | GHSA-48c2-53v4-hqq9 | transitive via `lint-staged` | Dev-only | Bump in scheduled deps update. |
| `dompurify 3.1.3-3.3.1` | Low | GHSA-v2wj-7wpq-c8vv (XSS) | transitive via `@scalar/hono-api-reference` | Dev/docs UI only | Bump scalar chain; avoid rendering untrusted HTML. |

## Gating Decision (pending)
- [ ] Decide whether CI should fail on high/critical runtime-path vulnerabilities.
- [ ] Decide remediation SLA/cadence for dev-only vs runtime-path findings.
- [ ] Add SAST/secrets/container scan tooling and triage ownership.
