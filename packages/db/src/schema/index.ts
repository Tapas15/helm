import { pgTable, text, timestamp, integer, jsonb, bigint, uniqueIndex, index, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  deviceId: text("device_id"),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)]);

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  threadId: text("thread_id"),
  goalId: text("goal_id"),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  kind: text("kind").notNull().default("assistant"),
  status: text("status").notNull().default("queued"),
  priority: integer("priority").notNull().default(0),
  plan: jsonb("plan"),
  checkpoint: jsonb("checkpoint"),
  state: jsonb("state").notNull().default(sql`'{}'::jsonb`),
  currentStepId: text("current_step_id"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  leaseOwner: text("lease_owner"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("tasks_user_status_updated_idx").on(t.userId, t.status, t.updatedAt),
  index("tasks_lease_idx").on(t.status, t.leaseUntil),
]);

export const taskMessages = pgTable("task_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  taskId: text("task_id").notNull().references(() => tasks.id),
  role: text("role").notNull(), // user | assistant | system | tool
  content: text("content").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("task_messages_task_created_idx").on(t.taskId, t.createdAt),
  index("task_messages_user_created_idx").on(t.userId, t.createdAt),
]);

export const taskEvents = pgTable("task_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  taskId: text("task_id").notNull().references(() => tasks.id),
  runId: text("run_id"),
  sessionId: text("session_id"),
  sequence: bigint("sequence", { mode: "number" }).notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull(),
  type: text("type").notNull(),
  correlationId: text("correlation_id"),
  causationId: text("causation_id"),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
}, (t) => [
  uniqueIndex("task_events_task_seq_uidx").on(t.taskId, t.sequence),
  index("task_events_task_ts_idx").on(t.taskId, t.ts),
]);

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  taskId: text("task_id").notNull().references(() => tasks.id),
  runId: text("run_id"),
  actionKind: text("action_kind").notNull(),
  actionHash: text("action_hash").notNull(),
  status: text("status").notNull().default("pending"),
  summary: text("summary").notNull(),
  evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
  decisionReason: text("decision_reason"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  index("approvals_task_status_idx").on(t.taskId, t.status),
  index("approvals_user_status_idx").on(t.userId, t.status),
]);

export const actionReceipts = pgTable("action_receipts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  taskId: text("task_id").notNull().references(() => tasks.id),
  runId: text("run_id"),
  approvalId: text("approval_id"),
  actionKind: text("action_kind").notNull(),
  actionHash: text("action_hash").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("recorded"),
  externalRef: text("external_ref"),
  evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("action_receipts_idempotency_uidx").on(t.idempotencyKey),
  index("action_receipts_task_idx").on(t.taskId, t.createdAt),
  index("action_receipts_action_hash_idx").on(t.actionHash),
]);

export const browserArtifacts = pgTable("browser_artifacts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  taskId: text("task_id").notNull().references(() => tasks.id),
  runId: text("run_id"),
  sessionId: text("session_id").notNull(),
  kind: text("kind").notNull(),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("browser_artifacts_task_idx").on(t.taskId, t.createdAt),
  index("browser_artifacts_session_idx").on(t.sessionId, t.createdAt),
]);

export const vaultSecrets = pgTable("vault_secrets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  encryptedValue: text("encrypted_value").notNull(),
  keyId: text("key_id").notNull().default("local-master-v1"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  index("vault_secrets_user_provider_idx").on(t.userId, t.provider),
  index("vault_secrets_user_name_idx").on(t.userId, t.name),
]);

export const connectorAccounts = pgTable("connector_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  connectorId: text("connector_id").notNull(),
  status: text("status").notNull().default("pending"),
  secretRefId: text("secret_ref_id"),
  scopes: jsonb("scopes").notNull().default(sql`'[]'::jsonb`),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("connector_accounts_user_connector_idx").on(t.userId, t.connectorId),
  index("connector_accounts_user_status_idx").on(t.userId, t.status),
]);

export const oauthStates = pgTable("oauth_states", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  connectorId: text("connector_id").notNull(),
  stateHash: text("state_hash").notNull(),
  pkceVerifierEncrypted: text("pkce_verifier_encrypted").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  scopes: jsonb("scopes").notNull().default(sql`'[]'::jsonb`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("oauth_states_user_connector_idx").on(t.userId, t.connectorId),
  index("oauth_states_expires_idx").on(t.expiresAt),
]);

export const identities = pgTable("identities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  class: text("class").notNull().default("helm-owned"),
  label: text("label").notNull(),
  email: text("email"),
  provider: text("provider"),
  scopes: jsonb("scopes").notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("pending"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("identities_user_class_idx").on(t.userId, t.class),
  index("identities_user_status_idx").on(t.userId, t.status),
]);

export const identityPolicies = pgTable("identity_policies", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  identityId: text("identity_id").notNull().references(() => identities.id),
  allowedDomains: jsonb("allowed_domains").notNull().default(sql`'[]'::jsonb`),
  allowedRecipients: jsonb("allowed_recipients").notNull().default(sql`'[]'::jsonb`),
  allowExternalWrites: boolean("allow_external_writes").notNull().default(false),
  requireApproval: boolean("require_approval").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("identity_policies_user_idx").on(t.userId),
  index("identity_policies_identity_idx").on(t.identityId),
]);

export const memoryNotes = pgTable("memory_notes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  identityId: text("identity_id").references(() => identities.id),
  kind: text("kind").notNull().default("note"),
  content: text("content").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("memory_notes_user_kind_idx").on(t.userId, t.kind),
  index("memory_notes_user_created_idx").on(t.userId, t.createdAt),
]);

export const skills = pgTable("skills", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  source: text("source").notNull().default("local"),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("skills_user_enabled_idx").on(t.userId, t.enabled),
]);

export const proactivityRules = pgTable("proactivity_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  triggerKind: text("trigger_kind").notNull().default("cron"),
  triggerConfig: jsonb("trigger_config").notNull().default(sql`'{}'::jsonb`),
  actionKind: text("action_kind").notNull().default("draft"),
  actionConfig: jsonb("action_config").notNull().default(sql`'{}'::jsonb`),
  requireApproval: boolean("require_approval").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("proactivity_rules_user_enabled_idx").on(t.userId, t.enabled),
]);

export const feedbackEvents = pgTable("feedback_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  taskId: text("task_id").references(() => tasks.id),
  runId: text("run_id"),
  kind: text("kind").notNull(), // task_outcome|approval_decision|tool_failure|user_correction|model_quality|eval_result
  signal: text("signal").notNull(), // positive|negative|neutral
  severity: text("severity").notNull().default("info"), // info|warn|error
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  evidenceRefs: jsonb("evidence_refs").notNull().default(sql`'[]'::jsonb`),
  redacted: boolean("redacted").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("feedback_events_user_kind_idx").on(t.userId, t.kind),
  index("feedback_events_task_idx").on(t.taskId),
  index("feedback_events_user_created_idx").on(t.userId, t.createdAt),
]);

export const evalCases = pgTable("eval_cases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  sourceFeedbackId: text("source_feedback_id").references(() => feedbackEvents.id),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("regression"), // regression|smoke|safety
  input: jsonb("input").notNull().default(sql`'{}'::jsonb`),
  expected: jsonb("expected").notNull().default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("draft"), // draft|active|retired
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("eval_cases_user_status_idx").on(t.userId, t.status),
  index("eval_cases_source_feedback_idx").on(t.sourceFeedbackId),
]);


export const selfImprovementProposals = pgTable("self_improvement_proposals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  sourceFeedbackId: text("source_feedback_id").references(() => feedbackEvents.id),
  sourceEvalCaseId: text("source_eval_case_id").references(() => evalCases.id),
  kind: text("kind").notNull().default("prompt_tuning"),
  title: text("title").notNull(),
  summary: text("summary"),
  status: text("status").notNull().default("draft"), // draft only in this slice
  riskLevel: text("risk_level").notNull().default("low"),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  activation: text("activation").notNull().default("blocked"), // blocked until explicit approval
  reviewStatus: text("review_status").notNull().default("pending"), // pending|in_review|approved_for_eval|rejected|changes_requested (metadata only; no activation)
  evalGateStatus: text("eval_gate_status").notNull().default("not_run"), // not_run|pending|passed|failed|waived (metadata only; no activation)
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  evidenceRefs: jsonb("evidence_refs").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("self_improvement_proposals_user_status_idx").on(t.userId, t.status),
  index("self_improvement_proposals_source_feedback_idx").on(t.sourceFeedbackId),
]);
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  taskId: text("task_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  decision: text("decision"),
  reason: text("reason"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
}, (t) => [index("audit_user_ts_idx").on(t.userId, t.ts)]);

