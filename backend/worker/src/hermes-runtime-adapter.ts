import type { AgentRuntime, AgentRuntimeEvent, AgentRuntimeInput } from "@helm/shared";

const now = () => new Date().toISOString();

/**
 * Optional Hermes sidecar adapter skeleton.
 * This does NOT copy Hermes code. It only provides a contract-conforming adapter
 * shape for future external integration behind an HTTP/runtime boundary.
 */
export class HermesSidecarRuntimeAdapter implements AgentRuntime {
  readonly provider = "hermes" as const;

  async *run(input: AgentRuntimeInput): AsyncIterable<AgentRuntimeEvent> {
    const trace = { ...input.trace, taskId: input.taskId, runId: input.runId, userId: input.userId, agentId: "hermes-sidecar" };
    yield { type: "runtime.started", ts: now(), trace, message: "Hermes sidecar adapter not configured", payload: { provider: this.provider, mode: "skeleton" } };
    yield {
      type: "runtime.failed",
      ts: now(),
      trace,
      message: "Hermes sidecar runtime is not configured in this environment",
      payload: { code: "HERMES_NOT_CONFIGURED", retryable: false, requiredEnv: ["HERMES_URL", "HERMES_TOKEN"] },
    };
  }

  async interrupt(_runId: string): Promise<void> {}
}
