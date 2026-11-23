import { pgTable, text, timestamp, integer, jsonb, bigint, uniqueIndex, index } from "drizzle-orm/pg-core";
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
    deviceId: text("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("sessions_user_idx").on(t.userId)]);
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
    state: jsonb("state").notNull().default(sql `'{}'::jsonb`),
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
    payload: jsonb("payload").notNull().default(sql `'{}'::jsonb`),
}, (t) => [
    uniqueIndex("task_events_task_seq_uidx").on(t.taskId, t.sequence),
    index("task_events_task_ts_idx").on(t.taskId, t.ts),
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
    metadata: jsonb("metadata").notNull().default(sql `'{}'::jsonb`),
}, (t) => [index("audit_user_ts_idx").on(t.userId, t.ts)]);
//# sourceMappingURL=index.js.map