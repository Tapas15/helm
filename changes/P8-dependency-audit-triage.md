# P8 Dependency Audit Triage (report-only baseline)

**Date:** 2026-11-24  
**Command:** `pnpm audit --audit-level=high` (local)  
**Result:** 6 vulnerabilities (0 critical, 1 high, 4 moderate, 1 low) at audit time.

## Findings

| Package | Severity | Advisory | Path | Helm exposure | Action |
|---|---|---|---|---|---|
| `flatted <3.4.0` | High | GHSA-rf6f-7fwh-wjgh (unbounded recursion DoS in parse) | dev/tooling chain (`eslint>file-entry-cache>flat-cache>flatted`) | Dev/lint only, not runtime service path | Accept temporarily; bump eslint/flat-cache chain in scheduled deps update; gate with CI report. |
| `undici 7.0.0-7.24.3/6.x` | Moderate | GHSA-4992-7rv2-5pvq, GHSA-f269-vfmq-vjvj (CRLF injection/request smuggling) | transitive via `@temporalio/*` | Runtime-adjacent for Temporal worker/client HTTP paths | Track upstream Temporal/undici release; avoid passing untrusted CR/LF in headers/paths (already avoided). Schedule upgrade/test. |
| `@xmldom/xmldom <0.8.12` | Moderate | GHSA-xf2r-c6m6-7rw4 (attribute/appended namespace misserialization) | transitive via `@azure/*` (Temporal/observability chain) | Low; no direct XML parsing path in Helm | Track upstream; no Helm direct usage. |
| `yaml <1.10.3 / 2.0.0-2.8.3` | Moderate | GHSA-48c2-53v4-hqq9 | transitive via `lint-staged` | Dev-only | Bump lint-staged/yaml in scheduled deps update. |
| `dompurify 3.1.3-3.3.1` | Low | GHSA-v2wj-7wpq-c8vv (XSS) | transitive via `@scalar/hono-api-reference` (dev/docs UI dependency chain) | Dev/docs UI only, not production runtime | Bump @scalar chain; avoid rendering untrusted HTML through affected component. |

## Policy
- CI keeps report-only `pnpm audit --audit-level=high` (`continue-on-error: true`) until high-severity runtime-path vulns are triaged/fixed or explicitly accepted.
- No blind dependency major-bumps in this pass; patch/minor upgrades should be done in a dedicated PR/commit with typecheck+tests.
- Re-run audit after dependency refresh and update this file.
