# P7b Retention / PII Policy Scaffolding (Draft)

**Status:** Scaffolding only. No auto-delete. No legal/compliance signoff.  
**Date:** 2026-11-25

## Purpose
Define safe defaults for long-term memory notes while P7b matures. This is an engineering guardrail, not legal/privacy approval.

## Defaults
- Memory is **off by default** (`HELM_MEMORY_ENABLED!=1`).
- Stored notes are **user-scoped** and DB-canonical.
- Sensitive-looking content is redacted before persistence (`[REDACTED_SENSITIVE_MEMORY]`).
- Provenance/confidence/version metadata is recorded.
- **No automatic deletion** is performed by this scaffold.

## Retention Metadata (scaffold)
Stored in `memory_notes.metadata` (no schema migration required):
- `retentionPolicy`: `user_controlled | ephemeral | session | indefinite` (default `user_controlled`)
- `expiresAt`: ISO timestamp or `null` (metadata only; not auto-enforced yet)
- `pii`: `none | possible | redacted`

## PII Handling
- Redact secrets/tokens/password/private-key-like patterns before save.
- If redacted, set `sensitivity=sensitive-redacted`, `redactedSensitive=true`, `pii=redacted`.
- Do not store raw secret values in memory content or audit metadata.
- Export/delete remain user-scoped and explicit.

## Prohibited (current phase)
- No autonomous memory capture without explicit product/policy decision.
- No auto-delete/retention enforcement job without approval and tests.
- No PII/legal compliance claim; P8/legal signoff required.
- No self-improvement activation or policy/security self-modification.

## Next Implementation Steps
1. Add retention enforcement job behind explicit flag + dry-run + audit (approval required before enablement).
2. Add PII classification rules/tests and redaction coverage expansion.
3. Add memory audit export filter and retention/PII review tooling.
4. Get P8/legal/privacy signoff before any auto-retention enforcement.
