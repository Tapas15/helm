import { z } from "zod";
import { TraceContext } from "./events.js";
export const AgentRuntimeProvider = z.enum(["helm-native", "hermes", "mock"]);
export const AgentRuntimeEventType = z.enum([
    "runtime.started",
    "runtime.planning",
    "runtime.tool.proposed",
    "runtime.tool.started",
    "runtime.tool.completed",
    "runtime.memory.loaded",
    "runtime.skill.loaded",
    "runtime.response.delta",
    "runtime.completed",
    "runtime.failed",
    "runtime.interrupted",
]);
export const AgentRuntimeEvent = z.object({
    type: AgentRuntimeEventType,
    ts: z.string().datetime(),
    trace: TraceContext.default({}),
    message: z.string().optional(),
    payload: z.record(z.unknown()).default({}),
});
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
export const AgentRuntimeResult = z.object({
    status: z.enum(["succeeded", "failed", "cancelled"]),
    output: z.string().optional(),
    result: z.unknown().optional(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
});
//# sourceMappingURL=agent-runtime.js.map