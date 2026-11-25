# P7b Memory Status / Retrieval / Consolidation Contract

**Date:** 2026-11-25  
**Status:** Implemented contract (flag-gated, safe defaults). No activation. No auto-delete.

## Flag defaults (safe)
- `HELM_MEMORY_ENABLED=0` - memory data routes disabled by default.
- `HELM_MEMORY_RETRIEVAL_ENABLED=0` - retrieval endpoint disabled.
- `HELM_MEMORY_SEMANTIC_RETRIEVAL=0` - semantic mode disabled.
- `HELM_MEMORY_EMBEDDING_PROVIDER=disabled` - no injected embedding provider by default.
- `HELM_MEMORY_CONSOLIDATION_DRY_RUN=0` - consolidation dry-run disabled.
- `HELM_MEMORY_RETENTION_DRY_RUN=0` - retention dry-run disabled.

## Status contract (`GET /v1/memory/status`)
Reports safe flags/counters:
- `enabled`, `mode`, `notesVisible`
- `retrievalEnabled`, `semanticRetrievalEnabled`
- `embeddingProviderSelection`, `embeddingProviderInjected` (currently `false`; API injects no provider)
- `consolidationDryRunEnabled`, `retentionDryRunEnabled`

When disabled, status reports `enabled=false`, `mode=disabled`, `notesVisible=0` and does not query note rows.

## Retrieval contract
- Flag-gated: `HELM_MEMORY_RETRIEVAL_ENABLED=1`.
- Bounded scan/limit; user-scoped.
- Semantic mode is deterministic local `semantic-hash-fallback` when `HELM_MEMORY_SEMANTIC_RETRIEVAL=1`.
- Embedding provider seam is fail-closed: only explicitly injected trusted provider with explicit matching selection can be used; unknown/disabled selection keeps hash fallback; provider error falls back to lexical.
- No default external calls. No model download. No behavior change when flags off.
- Audit `memory.retrieval.query` records bounded metadata (`qLength`, `scanned`, `matches`, `mode`, `limit`) and must not store raw query text.

## Consolidation contract
- Flag-gated: `HELM_MEMORY_CONSOLIDATION_DRY_RUN=1`.
- Report-only: candidates include merge-preview metadata with `applied=false`.
- Response always `dryRun=true`, `deleted:0`, `modified:0`.
- No apply endpoint exists; contract test expects 404/405 for POST/PUT/PATCH/DELETE `/v1/memory/consolidation/apply`.
- No auto-merge, no auto-delete.

## Retention contract
- Metadata only (`retentionPolicy`, `expiresAt`, `pii`).
- Dry-run endpoint is report-only, `deleted:0`; no deletion/enforcement.
- Enforcement blocked pending explicit approval + dry-run report/audit/legal-privacy signoff/retention windows; no vault-secret deletion.

## Audit contract
- `GET /v1/memory/audit/recent` is flag-gated by `HELM_MEMORY_ENABLED=1`; returns 403 when disabled.
- Returns bounded user-scoped memory-note audit metadata only (`id, ts, action, resourceId, decision, reason, metadata`), limit 50.
- Audit reads are best-effort/observability only; no note content is returned.

## Evidence (local)
- `pnpm -C backend/api exec vitest run src/routes/memory.test.ts --reporter=verbose` (status disabled-safe, status no secret/config leak beyond selection+injected, retrieval/consolidation/retention audit bounded metadata with no raw note content/query leakage, disabled/flag-disabled retrieval+consolidation+retention forbidden error-shape no-leak, consolidation no-apply/dry-run, retention dry-run, audit recent bounded/disabled 403, route-inventory enabled gate except status). PASS 29/29.
- `pnpm -C packages/shared exec vitest run src/memory-retrieval.eval.test.ts --reporter=verbose` (lexical/hash fallback, fail-closed provider selection, no provider call when flag off, provider error fallback).
- `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit`
- `pnpm -C packages/shared build`
