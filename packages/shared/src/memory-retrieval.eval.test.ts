import { describe, expect, it } from "vitest";
import { createMemoryRetrievalProvider, HashedSemanticMemoryRetrievalProvider, LexicalMemoryRetrievalProvider } from "@helm/shared";

const docs = [
  { id: "m1", kind: "preference", content: "User prefers dark mode editor theme", metadata: { provenance: { kind: "user_confirmed" }, confidence: 1 } },
  { id: "m2", kind: "note", content: "Meeting notes about quarterly roadmap", metadata: { provenance: { kind: "observed" }, confidence: 0.8 } },
  { id: "m3", kind: "note", content: "Likes dim interface colors at night", metadata: { provenance: { kind: "inferred" }, confidence: 0.6 } },
];

describe("memory retrieval eval scaffold (P7b, local deterministic)", () => {
  it("lexical provider ranks exact token match first", () => {
    const p = new LexicalMemoryRetrievalProvider();
    const matches = p.query({ query: "dark mode", documents: docs, limit: 5 });
    expect(matches[0]?.id).toBe("m1");
    expect(matches.every((m) => m.mode === "lexical")).toBe(true);
  });

  it("semantic-hash-fallback can surface semantically related note", () => {
    const p = new HashedSemanticMemoryRetrievalProvider();
    const matches = p.query({ query: "night theme", documents: docs, limit: 5 });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.id === "m3")).toBe(true);
    expect(matches.some((m) => m.mode === "semantic-hash-fallback")).toBe(true);
  });

  it("factory selects mode by flag only (no external calls)", () => {
    expect(createMemoryRetrievalProvider({ HELM_MEMORY_SEMANTIC_RETRIEVAL: "0" }).mode).toBe("lexical");
    expect(createMemoryRetrievalProvider({ HELM_MEMORY_SEMANTIC_RETRIEVAL: "1" }).mode).toBe("semantic-hash-fallback");
  });

  it("returns empty for empty/stop-only query", () => {
    const p = new LexicalMemoryRetrievalProvider();
    expect(p.query({ query: "a", documents: docs, limit: 5 })).toEqual([]);
  });
});
