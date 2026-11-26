import { describe, expect, it } from "vitest";
import { mergeTaskEvents, type TaskEvent } from "./useTaskEventStream";

const evt = (over: Partial<TaskEvent> & Pick<TaskEvent, "id" | "sequence">): TaskEvent => ({
  id: over.id,
  sequence: over.sequence,
  type: over.type ?? "task.updated",
  source: over.source ?? "worker",
  ts: over.ts ?? "2026-11-26T00:00:00.000Z",
  payload: over.payload ?? {},
});

describe("mergeTaskEvents", () => {
  it("appends and sorts by sequence", () => {
    const a = evt({ id: "e1", sequence: 1 });
    const b = evt({ id: "e2", sequence: 2 });
    expect(mergeTaskEvents([b], a)).toEqual([a, b]);
  });

  it("dedupes by id", () => {
    const a = evt({ id: "e1", sequence: 1 });
    const prev = [a];
    expect(mergeTaskEvents(prev, evt({ id: "e1", sequence: 1, payload: { changed: true } }))).toBe(prev);
  });

  it("dedupes by sequence", () => {
    const a = evt({ id: "e1", sequence: 1 });
    const prev = [a];
    expect(mergeTaskEvents(prev, evt({ id: "e1-other", sequence: 1 }))).toBe(prev);
  });
});
