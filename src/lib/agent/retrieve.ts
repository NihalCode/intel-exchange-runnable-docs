import type {
  AgentIndex,
  AgentChunk,
  RetrievalEvidence,
  RetrievalMode,
  RetrievalReasonCode,
  ScoredChunk,
} from "./types";
export type { RetrievalEvidence, RetrievalReasonCode } from "./types";
import { termFrequencies, tokenize } from "./tokenize";

const K1 = 1.2;
const B = 0.75;
const LEXICAL_WEIGHT = 0.65;
const SEMANTIC_WEIGHT = 0.35;
// A handful of endpoint pages (e.g. CQL field-mapping reference tables, SDO
// create/update schemas) are 10-14x longer than the ~62-token average chunk.
// Standard BM25 length normalization treats that as "unfocused" and crushes
// their score for every query, even when they are the single best answer
// (e.g. "list threat data" never surfaced for "how do I list CTIX
// indicators?" without this cap). Capping the length ratio keeps some
// normalization (long docs are still penalized relative to average) without
// letting it dominate the score entirely.
const MAX_LENGTH_RATIO = 3;

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
  const lengthRatio = Math.min(docLen / avgDocLen, MAX_LENGTH_RATIO);
  for (const [term, qtf] of Object.entries(queryTerms)) {
    const tf = docTerms[term] ?? 0;
    if (tf === 0) continue;
    const denom = tf + K1 * (1 - B + B * lengthRatio);
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

/**
 * Fuse independently-ranked result sets without assuming their scores share a
 * scale. Reciprocal rank fusion preserves strong lexical matches even when a
 * vector store returns different documents.
 */
export function fuseRankedResults(
  lexical: ScoredChunk[],
  semantic: ScoredChunk[],
  limit = 12,
  rankConstant = 60
): ScoredChunk[] {
  const byId = new Map<string, ScoredChunk>();

  for (const [rank, chunk] of lexical.entries()) {
    byId.set(chunk.id, {
      ...chunk,
      score: 1 / (rankConstant + rank + 1),
    });
  }

  for (const [rank, chunk] of semantic.entries()) {
    const contribution = 1 / (rankConstant + rank + 1);
    const existing = byId.get(chunk.id);
    if (existing) {
      existing.semanticScore = chunk.semanticScore;
      existing.score += contribution;
    } else {
      byId.set(chunk.id, {
        ...chunk,
        score: contribution,
      });
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Derive a visible retrieval status without exposing provider error details. */
export function retrievalStatus(
  vectorAttempted: boolean,
  vectorContributed: boolean,
  vectorFailed: boolean,
  reasonCode?: RetrievalReasonCode
): {
  retrievalMode: RetrievalMode;
  retrievalDegraded: boolean;
  retrievalReasonCode: RetrievalReasonCode;
} {
  if (vectorContributed) {
    return {
      retrievalMode: "hybrid",
      retrievalDegraded: vectorFailed,
      retrievalReasonCode: reasonCode ?? (vectorFailed ? "pinecone_query_failed" : "hybrid_ok"),
    };
  }
  if (vectorAttempted && vectorFailed) {
    return {
      retrievalMode: "degraded_lexical",
      retrievalDegraded: true,
      retrievalReasonCode: reasonCode ?? "pinecone_query_failed",
    };
  }
  if (!vectorAttempted) {
    return {
      retrievalMode: "lexical",
      retrievalDegraded: false,
      retrievalReasonCode: reasonCode ?? "openai_not_configured",
    };
  }
  return {
    retrievalMode: "lexical",
    retrievalDegraded: false,
    retrievalReasonCode: reasonCode ?? "lexical_only",
  };
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

/**
 * Combined indexes prefix chunk ids as `{productId}::{rawId}` to avoid
 * collisions (e.g. `tags::section` exists in CTIX and Orchestrate). Pinecone
 * stores the raw id inside a product namespace (and often `metadata.productId`).
 * Resolve either form so vector hits are not dropped as an "id mismatch".
 */
export function resolveChunkIdForPineconeMatch(
  matchId: string,
  byId: Map<string, AgentChunk>,
  metadataProductId?: string,
  fallbackProductId?: string
): string | undefined {
  if (byId.has(matchId)) return matchId;

  const candidates: string[] = [];
  const meta =
    typeof metadataProductId === "string" && metadataProductId.trim()
      ? metadataProductId.trim()
      : undefined;
  const fallback =
    typeof fallbackProductId === "string" && fallbackProductId.trim()
      ? fallbackProductId.trim()
      : undefined;

  for (const productId of [meta, fallback]) {
    if (!productId) continue;
    const prefix = `${productId}::`;
    if (!matchId.startsWith(prefix)) candidates.push(`${prefix}${matchId}`);
  }

  // Last resort: try known product prefixes when metadata is missing.
  if (candidates.length === 0) {
    for (const productId of ["ctix", "cftr", "csap", "orchestrate"]) {
      candidates.push(`${productId}::${matchId}`);
    }
  }

  for (const id of candidates) {
    if (byId.has(id)) return id;
  }
  return undefined;
}

/** Map external (e.g. Pinecone) match ids+scores back to local chunks. */
export function scoredChunksByIds(
  matches: { id: string; score: number; metadata?: Record<string, unknown> }[],
  index: AgentIndex,
  fallbackProductId?: string
): ScoredChunk[] {
  const byId = chunkById(index);
  const out: ScoredChunk[] = [];
  for (const match of matches) {
    const metaPid =
      typeof match.metadata?.productId === "string" ? match.metadata.productId : undefined;
    const resolvedId = resolveChunkIdForPineconeMatch(
      match.id,
      byId,
      metaPid,
      fallbackProductId
    );
    if (!resolvedId) continue;
    const chunk = byId.get(resolvedId);
    if (!chunk) continue;
    out.push({
      ...chunk,
      score: match.score,
      lexicalScore: 0,
      semanticScore: match.score,
    });
  }
  return out;
}

/**
 * Convert retrieval evidence into a deliberately coarse compatibility value.
 * Do not expose ranking/similarity scores as user-facing probability.
 */
export function evidenceFromScores(scored: ScoredChunk[]): RetrievalEvidence {
  if (scored.length === 0) return "no_verified_match";
  if (scored.length === 1) return "limited_evidence";

  const lexicalSupport = scored.filter((chunk) => chunk.lexicalScore > 0).length;
  const corroboratingEndpoints = new Set(
    scored.filter((chunk) => chunk.kind === "endpoint").map((chunk) => chunk.slug)
  ).size;
  if (lexicalSupport >= 2 && corroboratingEndpoints >= 2) return "strong_match";
  return "partial_match";
}

export function confidenceFromScores(scored: ScoredChunk[]): number {
  switch (evidenceFromScores(scored)) {
    case "strong_match":
      return 0.75;
    case "partial_match":
      return 0.5;
    case "limited_evidence":
      return 0.25;
    case "no_verified_match":
      return 0;
  }
}

export function isLowConfidence(scored: ScoredChunk[]): boolean {
  const evidence = evidenceFromScores(scored);
  return evidence === "limited_evidence" || evidence === "no_verified_match";
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

const LIST_QUERY_PATTERN = /\b(list|get|show|fetch|retrieve|view|all)\b/i;
const LIST_ENDPOINT_PATTERN = /\b(list|get)\b/i;

/** Boost endpoint chunks when the query asks to list/get/show and title/path match. */
export function boostEndpointMatches(
  scored: ScoredChunk[],
  query: string,
  productId?: string
): ScoredChunk[] {
  const wantsList = LIST_QUERY_PATTERN.test(query);
  const ENDPOINT_KIND_BOOST = 0.12;
  const LIST_TITLE_BOOST = 0.18;
  const PRODUCT_MATCH_BOOST = 0.08;

  return scored
    .map((c) => {
      let boost = 0;
      if (c.kind === "endpoint") boost += ENDPOINT_KIND_BOOST;
      if (wantsList && c.kind === "endpoint") {
        const hay = `${c.title} ${c.path ?? ""} ${c.slug}`.toLowerCase();
        if (LIST_ENDPOINT_PATTERN.test(hay)) boost += LIST_TITLE_BOOST;
      }
      if (productId && productId !== "all" && (c.productId ?? "ctix") === productId) {
        boost += PRODUCT_MATCH_BOOST;
      }
      return boost > 0 ? { ...c, score: c.score + boost } : c;
    })
    .sort((a, b) => b.score - a.score);
}
