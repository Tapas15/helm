export * from "./id.js";
export * from "./errors.js";
export * from "./events.js";
export * from "./task-control.js";
export * from "./browser.js";
export * from "./agent-runtime.js";
export * from "./approval.js";
export * from "./auth.js";
export * from "./temporal.js";


import { z } from "zod";

export const TaskStatus = z.enum([
  "queued", "planning", "running", "waiting_approval", "waiting_input",
  "scheduled", "paused", "succeeded", "failed", "cancelled", "blocked",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskKind = z.enum(["assistant", "browser", "connector", "computer", "monitor"]);
export type TaskKind = z.infer<typeof TaskKind>;

export const CreateTaskInput = z.object({
  prompt: z.string().min(1),
  title: z.string().min(1).optional(),
  kind: TaskKind.default("assistant"),
  threadId: z.string().optional(),
  goalId: z.string().optional(),
  settings: z.record(z.unknown()).default({}),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const Task = z.object({
  id: z.string(),
  userId: z.string(),
  threadId: z.string().nullable(),
  goalId: z.string().nullable(),
  title: z.string(),
  prompt: z.string(),
  kind: TaskKind,
  status: TaskStatus,
  priority: z.number().int(),
  plan: z.unknown().nullable(),
  checkpoint: z.unknown().nullable(),
  state: z.record(z.unknown()),
  currentStepId: z.string().nullable(),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  leaseOwner: z.string().nullable(),
  leaseUntil: z.string().datetime().nullable(),
  nextRunAt: z.string().datetime().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  result: z.unknown().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type Task = z.infer<typeof Task>;

export const TaskControlAction = z.enum(["pause", "resume", "cancel", "retry"]);
export type TaskControlAction = z.infer<typeof TaskControlAction>;

export const EventEnvelope = z.object({
  eventId: z.string(),
  taskId: z.string(),
  runId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  sequence: z.number().int().nonnegative(),
  schemaVersion: z.number().int().default(1),
  ts: z.string().datetime(),
  source: z.string(),
  type: z.string(),
  correlationId: z.string().nullable().optional(),
  causationId: z.string().nullable().optional(),
  payload: z.record(z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean().default(false),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;



