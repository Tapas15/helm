# 09 - Security, Approvals, and Privacy

## 1. Security Posture

Assume the agent runtime, model output, web content, and third-party tools can be malicious or wrong. Security must be enforced by deterministic control-plane components.

**Core invariant:** Untrusted runtime cannot grant itself permissions, access raw secrets, bypass approvals, or perform unauthorized egress.

## 2. Threat Model (Prioritized)

| Threat | Vector | Impact | Mitigation |
|---|---|---|---|
| Prompt injection | Web/email/docs/tool output | unauthorized action/data exfil | content labeling, policy gate, no instruction-following from data |
| Approval spoofing | model/chat says "approved" | unintended send/buy/delete | structured approval objects, signed decisions, hash binding |
| Secret exfiltration | tool output, logs, prompt | account compromise | vault refs, redaction, brokered credentials |
| SSRF/private network | browser/fetch/tool URL | internal data access | URL validation, DNS/IP checks, egress proxy |
| Duplicate side effects | retries/timeouts | double-send/pay | idempotency keys, receipts, reconciliation |
| Privilege escalation | connector scope creep | overbroad access | least-privilege scopes, per-action policy |
| Malicious MCP/skill | untrusted tool package | RCE/data theft | sandbox, allowlist, signed manifests, no auto-secrets |

## 3. Sentinel / Policy Engine

Adopt OpenMuse Sentinel pattern as `PolicyDecisionService`.

```ts
type ActionRequest = {
  requestId: string;
  taskId: string;
  runId: string;
  actor: "agent" | "user" | "system";
  tool: string;
  action: string;
  resource: string;
  args: Record<string, unknown>;
  risk: "low" | "medium" | "high" | "critical";
  dataSensitivity: "public" | "internal" | "restricted";
  idempotencyKey?: string;
};

type PolicyDecision =
  | { decision: "ALLOW"; grantId?: string; constraints?: object }
  | { decision: "DENY"; reason: string }
  | { decision: "ASK_USER"; approvalId: string; prompt: ApprovalPrompt };
```

**Decision rules:**
- Deny by default for unknown tools/resources.
- Risk tier + connector scope + user policy + context.
- High-risk writes require approval unless explicit standing grant.
- Critical actions (payments, account security, destructive admin) require fresh approval every time.

## 4. Approval System

### 4.1 Approval Object

```ts
type ApprovalRequest = {
  approvalId: string;
  taskId: string;
  actionHash: string; // hash of tool+args+target+connection+version
  title: string;
  summary: string;
  risk: "medium" | "high" | "critical";
  expiresAt: string;
  status: "pending" | "approved" | "denied" | "expired" | "executed";
  preview: object; // email draft, calendar diff, form submit payload
};
```

### 4.2 Binding Rules

- Approval binds to exact `actionHash`.
- Any change to recipient, amount, URL, account, file path, or payload => invalidate.
- Approval single-use unless explicitly scoped standing grant (low/medium only).
- Expiry required (default 10-30 min).
- Decision recorded with actor, timestamp, UI surface, IP/device.

## 5. Identity, Auth, and Authorization

- **AuthN:** local session (desktop) or OIDC (hosted).
- **AuthZ:** owner-scoped resources; RBAC ready but single-user MVP.
- **Worker auth:** short-lived service tokens scoped to task/run.
- **Session security:** httpOnly secure cookies, CSRF for browser clients, loopback binding in local mode.

## 6. Secret Management

| Secret type | Storage | Runtime access |
|---|---|---|
| OAuth refresh/access tokens | Vault/KMS encrypted | brokered short-lived handle |
| API keys | Vault | connector worker only |
| Local encryption key | OS keychain/secure file | control plane |
| User passwords | never stored by agent | user enters directly in takeover |

Rules:
- Never put secrets in prompts, events, logs, or memory.
- Mask/redact secret-like patterns in tool output.
- Rotate/revoke on disconnect or suspected compromise.

## 7. Sandbox and Isolation

### Browser worker
- Separate process/container.
- Per-user profile isolation.
- No access to vault.
- Egress policy and download scanning.

### Computer worker
- Docker/E2B sandbox, non-root, no host socket.
- Workspace volume only.
- Resource limits and command policy.
- Network off by default.

### MCP/Skill runtime
- Untrusted by default.
- Allowlist + version pin + manifest signature/checksum.
- No credentials unless explicit brokered scope.

## 8. Data Privacy

### 8.1 Data Classes

| Class | Examples | Handling |
|---|---|---|
| Public | public web pages | normal logs |
| Internal | tasks, preferences | encrypted at rest, access controlled |
| Restricted | emails, files, tokens, financial | redacted logs, strict retention, local-only routing option |

### 8.2 Privacy Controls

- Memory inspect/edit/delete/export.
- "Do not remember" mode.
- Data retention policies per artifact/log type.
- Provider data routing policy (local-only for restricted).
- Clear consent for cloud model usage.

## 9. Audit Logging

Audit every sensitive event:
- approval requested/decided/expired
- connector connected/disconnected/token refreshed
- external write attempted/executed/failed/uncertain
- takeover start/end
- policy deny/allow
- secret access by broker (metadata only)

Audit record fields: `id, ts, actor, owner, taskId, action, resource, decision, reason, ip/device, correlationId`. Immutable append-only.

## 10. Egress and Network Controls

- Deny private IP ranges, link-local, metadata IPs by default.
- DNS rebinding protection: resolve and recheck.
- Allowlists for high-risk environments.
- Separate egress policies for browser, connectors, model providers.
- TLS verification required; pinning optional for critical connectors.

## 11. Incident Response

- Emergency stop endpoint/UI: pause all tasks, block external writes.
- "Revoke all connections" action.
- Audit export for investigation.
- Secret rotation playbook.
- Incident severity levels and notification.

## 12. Security Testing

- Prompt injection suite (web/email/pdf).
- Approval bypass tests.
- SSRF/egress tests.
- Secret redaction tests.
- Idempotency/duplicate action tests.
- Sandbox escape attempts (baseline).
- Dependency scanning, SAST, container scanning.

## 13. Acceptance Criteria

- No high-risk action executes without approval record bound to hash.
- No raw secret appears in logs/events/memory.
- Disconnected/revoked connector is unusable immediately.
- SSRF to private/metadata addresses blocked.
- Audit trail sufficient to reconstruct sensitive action lifecycle.
- Emergency stop blocks new external writes within seconds.
