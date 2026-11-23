import { describe, expect, it } from "vitest";
import { uid } from "./id.js";

describe("uid", () => {
  it("prefixes ids", () => {
    const v = uid("task");
    expect(v.startsWith("task_")).toBe(true);
    expect(v.length).toBeGreaterThan(5);
  });
});
