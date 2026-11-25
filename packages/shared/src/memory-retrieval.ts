export type MemoryRetrievalMode = "lexical" | "semantic-hash-fallback" | "semantic-embedding";

export interface MemoryRetrievalDocument {
  id: string;
  kind: string;
  content: string;
  createdAt?: string | Date | null;
  metadata?: Record<string, unknown>;
}

export interface MemoryRetrievalMatch {
  id: string;
  score: number;
  matchedTokens: string[];
  provenance: string;
  confidence: number;
  mode: MemoryRetrievalMode;
}

export interface MemoryEmbeddingProvider {
  readonly id: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface MemoryRetrievalProvider {
  readonly mode: MemoryRetrievalMode;
  query(input: { query: string; documents: MemoryRetrievalDocument[]; limit: number }): Promise<MemoryRetrievalMatch[]> | MemoryRetrievalMatch[];
}

export interface MemoryRetrievalProviderOptions {
  env?: Record<string, string | undefined>;
  embeddingProvider?: MemoryEmbeddingProvider | null;
}

function tokenize(text: string): string[] {
  return String(text ?? "").toLowerCase().replace(/[^a-z0-9\s_-]/g, " ").split(/\s+/).filter((t) => t.length >= 2).slice(0, 80);
}

function provenanceConfidence(meta: Record<string, unknown>) {
  const provenance = String((meta.provenance as any)?.kind ?? "user_confirmed");
  const confidence = typeof meta.confidence === "number" ? Math.max(0, Math.min(1, meta.confidence)) : 0;
  return { provenance, confidence };
}

export class LexicalMemoryRetrievalProvider implements MemoryRetrievalProvider {
  readonly mode = "lexical" as const;
  query(input: { query: string; documents: MemoryRetrievalDocument[]; limit: number }): MemoryRetrievalMatch[] {
    const q = input.query.trim().slice(0, 200);
    const qTokens = Array.from(new Set(tokenize(q))).slice(0, 20);
    if (!q || qTokens.length === 0) return [];
    return input.documents.map((doc) => {
      const hay = `${String(doc.kind ?? "")} ${String(doc.content ?? "")}`.toLowerCase();
      const tokens = new Set(tokenize(hay));
      let score = 0;
      const matched: string[] = [];
      for (const t of qTokens) {
        if (tokens.has(t)) { score += 2; matched.push(t); }
        else if (hay.includes(t)) { score += 1; matched.push(t); }
      }
      if (hay.includes(q.toLowerCase())) score += 3;
      const meta = (doc.metadata ?? {}) as Record<string, unknown>;
      const { provenance, confidence } = provenanceConfidence(meta);
      if (provenance === "user_confirmed") score += 0.5;
      if (provenance === "observed") score += 0.2;
      score += confidence * 0.3;
      return { id: doc.id, score, matchedTokens: Array.from(new Set(matched)).slice(0, 20), provenance, confidence, mode: this.mode };
    }).filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(20, input.limit || 5)));
  }
}

function hashToken(token: string, dims: number): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % dims;
}

function embed(text: string, dims = 64): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const t of tokenize(text)) { const idx = hashToken(t, dims); v[idx] = (v[idx] ?? 0) + 1; }
  const norm = Math.sqrt(v.reduce((s, n) => s + n * n, 0)) || 1;
  return v.map((n) => n / norm);
}

function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const av = a[i] ?? 0; const bv = b[i] ?? 0; s += av * bv; }
  return s;
}

// Deterministic local semantic fallback (hashed bag-of-words embedding). No external calls, no model download.
export class HashedSemanticMemoryRetrievalProvider implements MemoryRetrievalProvider {
  readonly mode = "semantic-hash-fallback" as const;
  private lexical = new LexicalMemoryRetrievalProvider();
  query(input: { query: string; documents: MemoryRetrievalDocument[]; limit: number }): MemoryRetrievalMatch[] {
    const lexical = this.lexical.query(input);
    const qVec = embed(input.query);
    const byId = new Map(lexical.map((m) => [m.id, m]));
    for (const doc of input.documents) {
      const dVec = embed(`${doc.kind ?? ""} ${doc.content ?? ""}`);
      const sim = cosine(qVec, dVec); // -1..1
      if (sim <= 0.05) continue;
      const meta = (doc.metadata ?? {}) as Record<string, unknown>;
      const { provenance, confidence } = provenanceConfidence(meta);
      const prev = byId.get(doc.id);
      const semanticScore = sim * 3;
      if (prev) {
        prev.score += semanticScore;
        prev.mode = this.mode;
      } else {
        byId.set(doc.id, { id: doc.id, score: semanticScore + confidence * 0.2, matchedTokens: [], provenance, confidence, mode: this.mode });
      }
    }
    return Array.from(byId.values())
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(20, input.limit || 5)));
  }
}

export class EmbeddingMemoryRetrievalProvider implements MemoryRetrievalProvider {
  readonly mode = "semantic-embedding" as const;
  private lexical = new LexicalMemoryRetrievalProvider();
  constructor(private embeddingProvider: MemoryEmbeddingProvider) {}
  async query(input: { query: string; documents: MemoryRetrievalDocument[]; limit: number }): Promise<MemoryRetrievalMatch[]> {
    const lexical = this.lexical.query(input);
    try {
      const texts = [input.query, ...input.documents.map((d) => `${d.kind ?? ""} ${d.content ?? ""}`)];
      const vectors = await this.embeddingProvider.embed(texts);
      const qVec = vectors[0];
      if (!qVec || !Array.isArray(qVec)) return lexical;
      const byId = new Map(lexical.map((m) => [m.id, m]));
      for (let i = 0; i < input.documents.length; i++) {
        const doc = input.documents[i]!;
        const dVec = vectors[i + 1];
        if (!dVec || !Array.isArray(dVec)) continue;
        const sim = cosine(qVec, dVec);
        if (sim <= 0.05) continue;
        const meta = (doc.metadata ?? {}) as Record<string, unknown>;
        const { provenance, confidence } = provenanceConfidence(meta);
        const prev = byId.get(doc.id);
        const semanticScore = sim * 3;
        if (prev) { prev.score += semanticScore; prev.mode = this.mode; }
        else byId.set(doc.id, { id: doc.id, score: semanticScore + confidence * 0.2, matchedTokens: [], provenance, confidence, mode: this.mode });
      }
      return Array.from(byId.values()).filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(20, input.limit || 5)));
    } catch {
      return lexical;
    }
  }
}

export function createMemoryRetrievalProvider(
  envOrOptions: Record<string, string | undefined> | MemoryRetrievalProviderOptions = process.env as any,
): MemoryRetrievalProvider {
  const options: MemoryRetrievalProviderOptions = ("env" in envOrOptions || "embeddingProvider" in envOrOptions)
    ? (envOrOptions as MemoryRetrievalProviderOptions)
    : { env: envOrOptions as Record<string, string | undefined> };
  const env = options.env ?? (process.env as any);
  if (env.HELM_MEMORY_SEMANTIC_RETRIEVAL === "1") {
    const requested = String(env.HELM_MEMORY_EMBEDDING_PROVIDER ?? "disabled").trim().toLowerCase();
    // Fail closed: external/unknown providers never make calls. Only an explicitly injected provider with explicit selection is used.
    if (requested === "disabled" || requested === "hash" || requested === "none") return new HashedSemanticMemoryRetrievalProvider();
    if (options.embeddingProvider && requested === String(options.embeddingProvider.id).trim().toLowerCase()) return new EmbeddingMemoryRetrievalProvider(options.embeddingProvider);
    return new HashedSemanticMemoryRetrievalProvider();
  }
  return new LexicalMemoryRetrievalProvider();
}
