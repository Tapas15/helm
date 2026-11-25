# Helm Memory Implementation (P7/P7b) — Current State

**Status:** In-progress P7b (local draft + this doc); P7a/P7c/P7d are different systems.  
**Date:** 2026-11-25  
**Owner:** Helm (Kilo)  
**Scope:** Long-term memory notes (P7b). Not feedback/eval (P7a), not skills/playbooks (P7c), not auto-tuning (P7d).

## Simple Explanation

- **P7b memory** is Helm’s “important things to remember” notebook.
- It does **not** auto-save every chat message.
- It saves notes in the DB only through memory APIs when memory is enabled.
- It tries to be safe: it redacts secrets, labels guesses, versions changes, and lets users list/get/edit/export/delete.

## What Is Implemented Now

| Capability | Status | Evidence / Path |
|---|---|---|
| Memory notes DB table | Implemented | `packages/db/src/schema/index.ts` (`memory_notes`), `packages/db/drizzle/0001_p7_tables_manual.sql` |
| Flag-gated memory routes | Implemented | `backend/api/src/routes/memory.ts`, `HELM_MEMORY_ENABLED=1` |
| Create/list/get/export/patch/delete notes | Implemented (local draft for P7b depth) | `backend/api/src/routes/memory.ts` |
| Sensitive content redaction before save | Implemented | `redactSensitive()` in memory route; marks `[REDACTED_SENSITIVE_MEMORY]`, `sensitivity`, `redactedSensitive` |
| Provenance labels | Implemented (local draft) | `user_confirmed`, `observed`, `inferred` in metadata.provenance.kind |
| Inferred-memory gate | Implemented (local draft) | inferred requires `confirmed=true` or `HELM_MEMORY_ALLOW_INFERRED=1` |
| Confidence/version metadata | Implemented (local draft) | `confidence` clamped; `version` increments on metadata updates |
| Runtime memory loading | Implemented | `backend/worker/src/index.ts` loads bounded enabled recent notes into runtime context and emits `runtime.memory.loaded` |
| User-scoped access | Implemented | routes filter by `c.get("userId")` and note id |
| No autonomous self-improvement activation | Implemented as gate | `skills` status reports `selfImprovement.allowed=false`, `requiresExplicitApproval=true`; P7b has no activation path |

## API Surface (Current)

All routes require normal Helm auth/user scope and `HELM_MEMORY_ENABLED=1` except status behavior as coded.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/v1/memory/status` | Memory feature status/count | reports `enabled`, `mode`, `notesVisible`, `inferredAllowed` |
| GET | `/v1/memory/notes` | List notes | newest first, limit 100; optional `?provenance=` filter |
| GET | `/v1/memory/notes/:id` | Get one note | user-scoped |
| POST | `/v1/memory/notes` | Create note | redacts sensitive content; provenance/confidence/sensitivity/version metadata |
| PATCH | `/v1/memory/notes/:id` | Update note | re-redacts content, updates provenance/confidence/version metadata |
| GET | `/v1/memory/export` | Export notes | newest first, limit 500 |
| DELETE | `/v1/memory/notes/:id` | Delete note | user-scoped hard delete of note row |

## Memory Note Shape (Practical)

Stored in `memory_notes` table:

```ts
{
  id: string,
  userId: string,
  identityId: string | null,
  kind: string,             // default "note"
  content: string,          // redacted if sensitive
  metadata: {
    source: "api",
    redactedSensitive: boolean,
    sensitivity: "normal" | "sensitive-redacted",
    confidence: number,     // 0..1; inferred capped
    confirmed: boolean,
    provenance: {
      kind: "user_confirmed" | "observed" | "inferred",
      actor: "user",
      actorId: string,
      ts: string,
      action: "create" | "update",
      source: "api"
    },
    version: number
  },
  createdAt: Date,
  updatedAt: Date
}
```

## Execution Flow (Approved P7b)

1. **Receive**: API receives memory create/patch request; reject if `HELM_MEMORY_ENABLED!=1`.
2. **Validate**: require non-empty content for create; scope by authenticated `userId`.
3. **Label provenance**: `user_confirmed` default; allow `observed`/`inferred` when supplied.
4. **Gate inferred**: inferred notes blocked unless `confirmed=true` or `HELM_MEMORY_ALLOW_INFERRED=1`.
5. **Redact sensitive content**: secrets/tokens/password/private-key/vault-like patterns replaced with `[REDACTED_SENSITIVE_MEMORY]`.
6. **Persist**: DB-canonical insert/update with metadata version/confidence/provenance/sensitivity.
7. **Runtime use**: worker loads bounded recent enabled notes into context (`runtime.memory.loaded`), not entire history.
8. **User control**: list/get/patch/export/delete by user scope.
9. **No autonomous activation**: memory does not change policy/security/code or enable self-improvement.

## Safety Guards

- **Flag-gated**: `HELM_MEMORY_ENABLED` off means memory routes reject (403).
- **User-scoped**: all note queries filter by `userId`.
- **Secret redaction**: sensitive-looking content redacted before persistence.
- **Inferred gate**: guessed memories are not trusted by default.
- **Versioned metadata**: updates increment version and record provenance action.
- **Bounded runtime load**: worker loads recent bounded notes, not whole DB.
- **No autonomous behavior change**: P7b stores memory; it does not auto-tune prompts/routing, auto-enable skills, or activate self-improvement.

## Known Gaps / Not Implemented

- [ ] Automatic capture of “important” chat facts (currently explicit API notes; auto-capture would need policy/UX/consent design).
- [ ] Semantic retrieval/ranking for week/month-old memories (current runtime load is bounded recent notes).
- [ ] Memory consolidation/dedup/supersession workflow (`supersedesId` style) as first-class fields.
- [ ] Retention/PII policy + legal signoff (P8/legal input).
- [ ] Audit events for memory CRUD (recommended future hardening).
- [ ] Dedicated P7b route tests for inferred gate/redaction/version/provenance/export/delete.
- [ ] UI for memory inspect/edit/delete/export.

## Different Systems (Do Not Confuse)

| System | Purpose | Status |
|---|---|---|
| P7a Feedback + eval corpus | Learn from outcomes/failures; create eval cases | Scaffold implemented, flag-gated |
| **P7b Memory consolidation** | **Long-term user/task memory notes** | **In progress (this doc)** |
| P7c Skill/playbook proposals | Draft reusable skills from traces | Not implemented; approval-gated |
| P7d Bounded auto-tuning | Small prompt/routing tuning with eval/canary/rollback | Not implemented; highest risk |

## Verification

- `pnpm -C backend/api exec tsc -p tsconfig.json --noEmit` - PASS (2026-11-25, after P7b draft cleanup).
- `pnpm lint --filter @helm/api` - PASS (0 errors, 1 pre-existing warning: `backend/api/src/routes/browser.ts:128:18`).
- `pnpm -C backend/api exec vitest run src/routes/memory.test.ts src/lib/identity-policy.test.ts src/smoke.test.ts --reporter=verbose` - PASS (12/12, 2026-11-25).
- CI for latest P7b docs/test commits - **not watched per directive**.

## Change Log

- 2026-11-25: Created `changes/memory_implementation.md`; documented current P7b state, flow, guards, gaps, and verification.
