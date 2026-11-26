import { describe, expect, it } from "vitest";
import { HermesSidecarRuntimeAdapter } from "./hermes-runtime-adapter.js";

describe("HermesSidecarRuntimeAdapter contract skeleton", () => {
  it("conforms to runtime event contract and fails closed when unconfigured", async () => {
    const rt = new HermesSidecarRuntimeAdapter();
    const events: any[] = [];
    for await (const e of rt.run({ taskId: "t1", runId: "r1", userId: "u1", prompt: "hi", kind: "assistant", context: {}, thread: [], trace: {} } as any)) events.push(e);
    expect(rt.provider).toBe("hermes");
    expect(events[0]?.type).toBe("runtime.started");
    expect(events.at(-1)?.type).toBe("runtime.failed");
    expect(events.at(-1)?.payload?.code).toBe("HERMES_NOT_CONFIGURED");
  });
});
