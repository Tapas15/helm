# Phase 7 - Memory / Skills / Proactivity

**Status:** `[~]` 48%  
**Blueprint refs:** Phase 7, `05-Hermes-Agent-Runtime.md`, `07-Integrations-Apps-Models-Connectors.md`

## Goal
Personal assistant intelligence over time: agent-owned identity, memory, skills, proactivity, with explicit approval/safety boundaries.

## What we have done
- **Identity model/routes**: Shared identity contracts; DB-backed identity routes (status, list, create helm-owned, policy read/PATCH, connector-account binding). Helm-owned identity create defaults to restrictive policy.
- **Policy enforcement**: `backend/api/src/lib/identity-policy.ts` helper; wired into Gmail send, Calendar create/update/delete, and browser external action (flag-aware `HELM_IDENTITY_ENFORCEMENT=1`, bound `identityId` in browser session metadata). Identity policy unit tests PASS (4/4).
- **P7 data layer**: P7 DB tables/schema manually applied and verified (17 public tables); migration-history alignment tracked separately in P0.
- **Memory/skills/proactivity scaffolds**: Memory notes create/list/delete behind `HELM_MEMORY_ENABLED`; skills/proactivity rules behind flags with status/CRUD/PATCH. No autonomous execution.
- **Self-improvement gate**: Design doc exists (`DESIGN-self-improvement-loop.md`); routes/reporting keep `selfImprovement.allowed=false`, `requiresExplicitApproval=true`. Not implemented/activated.

## Checklist

### Completed
- [x] Shared identity contracts; DB-backed identity routes (status, list, create helm-owned, policy read/PATCH, connector-account binding).
- [x] Restrictive default identity policy on helm-owned identity create.
- [x] Identity policy enforcement helper: `backend/api/src/lib/identity-policy.ts`; wired into Gmail send and Calendar create/update/delete (flag-aware `HELM_IDENTITY_ENFORCEMENT`).
- [x] Browser external-action identity enforcement when `HELM_IDENTITY_ENFORCEMENT=1` and browser session metadata contains bound `identityId`.
- [x] Identity policy recipient/domain allowlist enforcement for Gmail send and Calendar create/update attendee writes (2026-11-25, flag-aware). Self-improvement status now exposes `requiresExplicitApproval=true`.
- [x] Identity policy unit tests: `backend/api/src/lib/identity-policy.test.ts` PASS (6/6).
- [x] Worker runtime loads enabled memory notes (bounded, `HELM_MEMORY_ENABLED=1`) into context and emits `runtime.memory.loaded` (2026-11-25).
- [x] P7 DB tables/schema manually applied and verified (17 public tables).
- [x] Memory notes behind `HELM_MEMORY_ENABLED`: create/list/delete endpoints.
- [x] Skills/proactivity rules behind flags with status/CRUD/PATCH; no autonomous execution.
- [x] Self-improvement design doc exists (`changes/DESIGN-self-improvement-loop.md`); routes/reporting keep `selfImprovement.allowed=false`, `requiresExplicitApproval=true`.

### Remaining / Blocked
- [ ] Broader identity-policy enforcement coverage across all side-effect paths (calendar read-sensitive/admin actions, connector config mutations, runtime-originated external writes as applicable).
- [ ] Identity vault linkage/UI; connector-account binding UX/policy visibility.
- [ ] Skill execution/proactivity scheduler (flag-gated, no unsafe autonomous behavior).
- [ ] Memory service depth: provenance/sensitivity/version/CRUD/export boundaries, inspect/edit/delete/export UX, redaction/retention policy.
- [ ] **Blocked (explicit user approval required):** self-improvement implementation/activation. Design-only until approved.

## Evidence
- `pnpm --filter @helm/api test -- identity-policy` PASS (4/4).
- P7 schema/tables manually applied; migration history alignment tracked in P0.
