# Helm Identity Model (P7/P4 design slice)

## Differentiator
Helm defaults to an **agent-owned identity** (dedicated email, username, browser profile, vault). Users do not share personal email/password.

## Identity classes
- `helm-owned`: agent mailbox/profile created and controlled by user through Helm. Default for signups, vendor comms, bookings, confirmations.
- `user-delegated`: explicit narrow OAuth/forwarding/alias bridge for personal inbox/calendar; never password. Requires approval and scoped policy.

## Invariants
- Every external action records `identityClass`, `identityRef`, `approvalId`, `actionHash`, `idempotencyKey`, receipt, and audit.
- No credential/password collection in prompts/logs/events.
- Blast radius limited to Helm identity; revocation/wipe must be first-class.

## MVP implementation notes
- Add `identities` + `identity_secrets` (vault refs) schema; connector accounts link to identity.
- Policy checks: allowed domains/recipients, spend/side-effect class, identity required.
- UI: show "Acting as: Helm Agent <agent@...>" before approval.
