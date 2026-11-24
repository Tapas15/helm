# Threat Model Baseline (P8)

## Assets
- Vault secrets, OAuth tokens, session tokens, task/event/audit/receipt data, browser artifacts.

## Trust boundaries
- Web/API <-> browser-worker; API <-> Temporal; API <-> external providers; model output (untrusted) -> tool/runtime.

## Key threats / mitigations
- **Prompt-injection/tool abuse**: model proposes, policy decides; approval+actionHash+idempotency for external writes.
- **Token/secret leakage**: vault encryption, log redaction, no secrets in events/prompts.
- **SSRF/external fetch abuse**: allowlists/guarded routes; expand domain policy checks (pending).
- **Authz bypass**: session-token auth, ownership checks, WS auth, legacy unbound block.
- **Duplicate side effects**: idempotency keys, receipts, uncertain reconciliation, no blind retry.
- **Supply chain**: lockfile/CI; dependency scan/SAST triage pending.

## Pending
- Formal STRIDE review, CI dependency/SAST gates, pen-test checklist, incident runbook.
