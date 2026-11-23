import { z } from "zod";
import { TraceContext } from "./events.js";

export const AgentRuntimeProvider = z.enum(["helm-native", "hermes", "mock"]);
export type AgentRuntimeProvider = z.infer<typeof AgentRuntimeProvider>;

export const AgentRuntimeEventType = z.enum([
  "runtime.started",
  "runtime.planning",
  "runtime.tool.proposed",
  "runtime.approval.requested",
  "runtime.approval.resolved",
  "runtime.tool.started",
  "runtime.tool.completed",
  "runtime.memory.loaded",
  "runtime.skill.loaded",
  "runtime.response.delta",
  "runtime.takeover.requested",
  "runtime.takeover.resumed",
  "runtime.completed",
  "runtime.failed",
  "runtime.interrupted",
]);
export type AgentRuntimeEventType = z.infer<typeof AgentRuntimeEventType>;

export const AgentRuntimeEvent = z.object({
  type: AgentRuntimeEventType,
  ts: z.string().datetime(),
  trace: TraceContext.default({}),
  message: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});
export type AgentRuntimeEvent = z.infer<typeof AgentRuntimeEvent>;

export const AgentRuntimeInput = z.object({
  taskId: z.string(),
  runId: z.string(),
  userId: z.string(),
  prompt: z.string().min(1),
  kind: z.string().default("assistant"),
  model: z.string().optional(),
  context: z.record(z.unknown()).default({}),
  trace: TraceContext.default({}),
});
export type AgentRuntimeInput = z.infer<typeof AgentRuntimeInput>;

export const AgentRuntimeResult = z.object({
  status: z.enum(["succeeded", "failed", "cancelled", "waiting_approval", "waiting_input"]),
  output: z.string().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
});
export type AgentRuntimeResult = z.infer<typeof AgentRuntimeResult>;

export interface AgentRuntime {
  readonly provider: AgentRuntimeProvider;
  run(input: AgentRuntimeInput): AsyncIterable<AgentRuntimeEvent>;
  interrupt?(runId: string): Promise<void>;
}
