import { z } from "zod";
export declare const AgentRuntimeProvider: z.ZodEnum<["helm-native", "hermes", "mock"]>;
export type AgentRuntimeProvider = z.infer<typeof AgentRuntimeProvider>;
export declare const AgentRuntimeEventType: z.ZodEnum<["runtime.started", "runtime.planning", "runtime.tool.proposed", "runtime.tool.started", "runtime.tool.completed", "runtime.memory.loaded", "runtime.skill.loaded", "runtime.response.delta", "runtime.completed", "runtime.failed", "runtime.interrupted"]>;
export type AgentRuntimeEventType = z.infer<typeof AgentRuntimeEventType>;
export declare const AgentRuntimeEvent: z.ZodObject<{
    type: z.ZodEnum<["runtime.started", "runtime.planning", "runtime.tool.proposed", "runtime.tool.started", "runtime.tool.completed", "runtime.memory.loaded", "runtime.skill.loaded", "runtime.response.delta", "runtime.completed", "runtime.failed", "runtime.interrupted"]>;
    ts: z.ZodString;
    trace: z.ZodDefault<z.ZodObject<{
        requestId: z.ZodOptional<z.ZodString>;
        correlationId: z.ZodOptional<z.ZodString>;
        causationId: z.ZodOptional<z.ZodString>;
        taskId: z.ZodOptional<z.ZodString>;
        runId: z.ZodOptional<z.ZodString>;
        stepId: z.ZodOptional<z.ZodString>;
        sessionId: z.ZodOptional<z.ZodString>;
        userId: z.ZodOptional<z.ZodString>;
        agentId: z.ZodOptional<z.ZodString>;
        tool: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        userId?: string | undefined;
        taskId?: string | undefined;
        runId?: string | undefined;
        sessionId?: string | undefined;
        correlationId?: string | undefined;
        causationId?: string | undefined;
        stepId?: string | undefined;
        requestId?: string | undefined;
        agentId?: string | undefined;
        tool?: string | undefined;
    }, {
        userId?: string | undefined;
        taskId?: string | undefined;
        runId?: string | undefined;
        sessionId?: string | undefined;
        correlationId?: string | undefined;
        causationId?: string | undefined;
        stepId?: string | undefined;
        requestId?: string | undefined;
        agentId?: string | undefined;
        tool?: string | undefined;
    }>>;
    message: z.ZodOptional<z.ZodString>;
    payload: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    ts: string;
    type: "runtime.started" | "runtime.planning" | "runtime.tool.proposed" | "runtime.tool.started" | "runtime.tool.completed" | "runtime.memory.loaded" | "runtime.skill.loaded" | "runtime.response.delta" | "runtime.completed" | "runtime.failed" | "runtime.interrupted";
    payload: Record<string, unknown>;
    trace: {
        userId?: string | undefined;
        taskId?: string | undefined;
        runId?: string | undefined;
        sessionId?: string | undefined;
        correlationId?: string | undefined;
        causationId?: string | undefined;
        stepId?: string | undefined;
        requestId?: string | undefined;
        agentId?: string | undefined;
        tool?: string | undefined;
    };
    message?: string | undefined;
}, {
    ts: string;
    type: "runtime.started" | "runtime.planning" | "runtime.tool.proposed" | "runtime.tool.started" | "runtime.tool.completed" | "runtime.memory.loaded" | "runtime.skill.loaded" | "runtime.response.delta" | "runtime.completed" | "runtime.failed" | "runtime.interrupted";
    payload?: Record<string, unknown> | undefined;
    message?: string | undefined;
    trace?: {
        userId?: string | undefined;
        taskId?: string | undefined;
        runId?: string | undefined;
        sessionId?: string | undefined;
        correlationId?: string | undefined;
        causationId?: string | undefined;
        stepId?: string | undefined;
        requestId?: string | undefined;
        agentId?: string | undefined;
        tool?: string | undefined;
    } | undefined;
}>;
export type AgentRuntimeEvent = z.infer<typeof AgentRuntimeEvent>;
export declare const AgentRuntimeInput: z.ZodObject<{
    taskId: z.ZodString;
    runId: z.ZodString;
    userId: z.ZodString;
    prompt: z.ZodString;
    kind: z.ZodDefault<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    trace: z.ZodDefault<z.ZodObject<{
        requestId: z.ZodOptional<z.ZodString>;
        correlationId: z.ZodOptional<z.ZodString>;
        causationId: z.ZodOptional<z.ZodString>;
        taskId: z.ZodOptional<z.ZodString>;
        runId: z.ZodOptional<z.ZodString>;
        stepId: z.ZodOptional<z.ZodString>;
        sessionId: z.ZodOptional<z.ZodString>;
        userId: z.ZodOptional<z.ZodString>;
        agentId: z.ZodOptional<z.ZodString>;
        tool: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        userId?: string | undefined;
        taskId?: string | undefined;
        runId?: string | undefined;
        sessionId?: string | undefined;
        correlationId?: string | undefined;
        causationId?: string | undefined;
        stepId?: string | undefined;
        requestId?: string | undefined;
        agentId?: string | undefined;
        tool?: string | undefined;
    }, {
        userId?: string | undefined;
        taskId?: string | undefined;
        runId?: string | undefined;
        sessionId?: string | undefined;
        correlationId?: string | undefined;
        causationId?: string | undefined;
        stepId?: string | undefined;
        requestId?: string | undefined;
        agentId?: string | undefined;
        tool?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    prompt: string;
    kind: string;
    taskId: string;
    runId: string;
    context: Record<string, unknown>;
    trace: {
        userId?: string | undefined;
        taskId?: string | undefined;
        runId?: string | undefined;
        sessionId?: string | undefined;
        correlationId?: string | undefined;
        causationId?: string | undefined;
        stepId?: string | undefined;
        requestId?: string | undefined;
        agentId?: string | undefined;
        tool?: string | undefined;
    };
    model?: string | undefined;
}, {
    userId: string;
    prompt: string;
    taskId: string;
    runId: string;
    kind?: string | undefined;
    context?: Record<string, unknown> | undefined;
    trace?: {
        userId?: string | undefined;
        taskId?: string | undefined;
        runId?: string | undefined;
        sessionId?: string | undefined;
        correlationId?: string | undefined;
        causationId?: string | undefined;
        stepId?: string | undefined;
        requestId?: string | undefined;
        agentId?: string | undefined;
        tool?: string | undefined;
    } | undefined;
    model?: string | undefined;
}>;
export type AgentRuntimeInput = z.infer<typeof AgentRuntimeInput>;
export declare const AgentRuntimeResult: z.ZodObject<{
    status: z.ZodEnum<["succeeded", "failed", "cancelled"]>;
    output: z.ZodOptional<z.ZodString>;
    result: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        retryable: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        retryable: boolean;
    }, {
        code: string;
        message: string;
        retryable: boolean;
    }>>;
}, "strip", z.ZodTypeAny, {
    status: "succeeded" | "failed" | "cancelled";
    result?: unknown;
    error?: {
        code: string;
        message: string;
        retryable: boolean;
    } | undefined;
    output?: string | undefined;
}, {
    status: "succeeded" | "failed" | "cancelled";
    result?: unknown;
    error?: {
        code: string;
        message: string;
        retryable: boolean;
    } | undefined;
    output?: string | undefined;
}>;
export type AgentRuntimeResult = z.infer<typeof AgentRuntimeResult>;
export interface AgentRuntime {
    readonly provider: AgentRuntimeProvider;
    run(input: AgentRuntimeInput): AsyncIterable<AgentRuntimeEvent>;
    interrupt?(runId: string): Promise<void>;
}
//# sourceMappingURL=agent-runtime.d.ts.map