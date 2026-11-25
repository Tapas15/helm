import { describe, expect, it, vi } from "vitest";
import { createMemoryRetrievalProvider, HashedSemanticMemoryRetrievalProvider, LexicalMemoryRetrievalProvider, type MemoryEmbeddingProvider } from "@helm/shared";

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

  it("does not call embedding provider when semantic flag is off", async () => {
    const embed = vi.fn(async () => [[1, 0], [1, 0]]);
    const provider: MemoryEmbeddingProvider = { id: "test-embed", embed };
    const p = createMemoryRetrievalProvider({ env: { HELM_MEMORY_SEMANTIC_RETRIEVAL: "0" }, embeddingProvider: provider });
    expect(p.mode).toBe("lexical");
    await p.query({ query: "dark mode", documents: docs, limit: 5 });
    expect(embed).not.toHaveBeenCalled();
  });

  it("uses embedding provider only when semantic flag is on", async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map((t) => (t.includes("dark") || t.includes("dim") ? [1, 0] : [0, 1])));
    const provider: MemoryEmbeddingProvider = { id: "test-embed", embed };
    const p = createMemoryRetrievalProvider({ env: { HELM_MEMORY_SEMANTIC_RETRIEVAL: "1" }, embeddingProvider: provider });
    expect(p.mode).toBe("semantic-embedding");
    const matches = await p.query({ query: "dark theme", documents: docs, limit: 5 });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(matches.some((m) => m.mode === "semantic-embedding")).toBe(true);
  });

  it("falls back to lexical when embedding provider fails", async () => {
    const provider: MemoryEmbeddingProvider = { id: "broken", embed: vi.fn(async () => { throw new Error("boom"); }) };
    const p = createMemoryRetrievalProvider({ env: { HELM_MEMORY_SEMANTIC_RETRIEVAL: "1" }, embeddingProvider: provider });
    const matches = await p.query({ query: "dark mode", documents: docs, limit: 5 });
    expect(matches[0]?.id).toBe("m1");
    expect(matches.every((m) => m.mode === "lexical")).toBe(true);
  });
});
