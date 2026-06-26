import type { AgentIndex, AgentChunk, ScoredChunk } from "./types";
import { termFrequencies, tokenize } from "./tokenize";

const K1 = 1.2;
const B = 0.75;
const LEXICAL_WEIGHT = 0.65;
const SEMANTIC_WEIGHT = 0.35;

function idf(term: string, index: AgentIndex): number {
  const df = index.lexical.df[term] ?? 0;
  const n = index.lexical.docCount;
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

function bm25Score(
  queryTerms: Record<string, number>,
  docTerms: Record<string, number>,
  docLen: number,
  avgDocLen: number,
  index: AgentIndex
): number {
  let score = 0;
  for (const [term, qtf] of Object.entries(queryTerms)) {
    const tf = docTerms[term] ?? 0;
    if (tf === 0) continue;
    const denom = tf + K1 * (1 - B + B * (docLen / avgDocLen));
    score += idf(term, index) * ((tf * (K1 + 1)) / denom) * qtf;
  }
  return score;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function chunkById(index: AgentIndex): Map<string, AgentChunk> {
  return new Map(index.chunks.map((c) => [c.id, c]));
}

export function retrieveLexical(
  query: string,
  index: AgentIndex,
  limit = 12
): ScoredChunk[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const queryTerms = termFrequencies(tokens);
  const chunks = chunkById(index);
  const avgDocLen = index.lexical.avgDocLen || 1;

  const scored: ScoredChunk[] = [];
  for (const doc of index.lexical.docs) {
    const chunk = chunks.get(doc.chunkId);
    if (!chunk) continue;
    const lexicalScore = bm25Score(queryTerms, doc.terms, doc.length, avgDocLen, index);
    if (lexicalScore <= 0) continue;
    scored.push({
      ...chunk,
      score: lexicalScore,
      lexicalScore,
      semanticScore: 0,
    });
  }

  scored.sort((a, b) => b.lexicalScore - a.lexicalScore);
  return scored.slice(0, limit);
}

export function mergeHybridScores(
  lexical: ScoredChunk[],
  semantic: ScoredChunk[],
  limit = 12
): ScoredChunk[] {
  const byId = new Map<string, ScoredChunk>();

  const maxLex = Math.max(...lexical.map((c) => c.lexicalScore), 1);
  const maxSem = Math.max(...semantic.map((c) => c.semanticScore), 1);

  for (const c of lexical) {
    byId.set(c.id, {
      ...c,
      lexicalScore: c.lexicalScore / maxLex,
      semanticScore: 0,
      score: (c.lexicalScore / maxLex) * LEXICAL_WEIGHT,
    });
  }

  for (const c of semantic) {
    const normSem = c.semanticScore / maxSem;
    const existing = byId.get(c.id);
    if (existing) {
      existing.semanticScore = normSem;
      existing.score = existing.lexicalScore * LEXICAL_WEIGHT + normSem * SEMANTIC_WEIGHT;
    } else {
      byId.set(c.id, {
        ...c,
        lexicalScore: 0,
        semanticScore: normSem,
        score: normSem * SEMANTIC_WEIGHT,
      });
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export function retrieveWithEmbedding(
  query: string,
  index: AgentIndex,
  queryEmbedding: number[],
  limit = 12
): ScoredChunk[] {
  const lexical = retrieveLexical(query, index, limit * 2);

  if (!index.hasEmbeddings) {
    return lexical.slice(0, limit);
  }

  const semantic: ScoredChunk[] = [];
  for (const chunk of index.chunks) {
    if (!chunk.embedding?.length) continue;
    const semanticScore = cosine(queryEmbedding, chunk.embedding);
    if (semanticScore <= 0) continue;
    semantic.push({
      ...chunk,
      score: semanticScore,
      lexicalScore: 0,
      semanticScore,
    });
  }

  semantic.sort((a, b) => b.semanticScore - a.semanticScore);
  return mergeHybridScores(lexical, semantic.slice(0, limit * 2), limit);
}

/** Map external (e.g. Pinecone) match ids+scores back to local chunks. */
export function scoredChunksByIds(
  matches: { id: string; score: number }[],
  index: AgentIndex
): ScoredChunk[] {
  const byId = chunkById(index);
  const out: ScoredChunk[] = [];
  for (const { id, score } of matches) {
    const chunk = byId.get(id);
    if (!chunk) continue;
    out.push({ ...chunk, score, lexicalScore: 0, semanticScore: score });
  }
  return out;
}

export const CONFIDENCE_THRESHOLD = 0.12;

export function confidenceFromScores(scored: ScoredChunk[]): number {
  if (scored.length === 0) return 0;
  return Math.min(1, scored[0].score);
}

export function isLowConfidence(scored: ScoredChunk[]): boolean {
  return confidenceFromScores(scored) < CONFIDENCE_THRESHOLD;
}

const PRODUCT_BOOST = 0.35;

/** Prefer chunks whose productId matches user-mentioned products. */
export function boostByProducts(scored: ScoredChunk[], productIds: string[]): ScoredChunk[] {
  if (productIds.length === 0) return scored;
  const set = new Set(productIds);
  return scored
    .map((c) => {
      const pid = c.productId ?? "ctix";
      const boost = set.has(pid) ? PRODUCT_BOOST : 0;
      return { ...c, score: c.score + boost };
    })
    .sort((a, b) => b.score - a.score);
}

export function filterByProducts(scored: ScoredChunk[], productIds: string[]): ScoredChunk[] {
  if (productIds.length === 0) return scored;
  const set = new Set(productIds);
  return scored.filter((c) => set.has(c.productId ?? "ctix"));
}
