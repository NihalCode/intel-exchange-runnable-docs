import { describe, expect, it } from "vitest";
import { retrieveLexical } from "../agent/retrieve";
import type { AgentIndex } from "../agent/types";

/**
 * Regression coverage for the BM25 length-normalization cap in retrieve.ts.
 *
 * Root cause: a handful of endpoint pages (CQL field-mapping tables, SDO
 * create/update schemas) are 10-14x longer than the ~62-token average chunk
 * in the real agent index. Standard BM25 length normalization treats that as
 * "unfocused" and crushed those chunks' score for every query, so the single
 * best documented answer for common questions ("how do I list CTIX
 * indicators?") never surfaced once a follow-up diluted the query — see the
 * strict response-quality testing report for the reproduction trace.
 */

function buildIndex(docs: { chunkId: string; terms: Record<string, number>; length: number }[]): AgentIndex {
  const df: Record<string, number> = {};
  for (const doc of docs) {
    for (const term of Object.keys(doc.terms)) {
      df[term] = (df[term] ?? 0) + 1;
    }
  }
  const avgDocLen = docs.reduce((sum, d) => sum + d.length, 0) / docs.length;
  return {
    hasEmbeddings: false,
    chunks: docs.map((d) => ({
      id: d.chunkId,
      slug: d.chunkId,
      title: d.chunkId,
      kind: "endpoint",
      productId: "ctix",
      text: "",
    })),
    lexical: { docs, df, docCount: docs.length, avgDocLen },
  } as unknown as AgentIndex;
}

describe("retrieveLexical BM25 length normalization", () => {
  it("does not fully bury a long, on-topic doc behind short, weakly-relevant docs", () => {
    // "long-doc" matches every query term and is the right answer, but is
    // ~14x longer than "avg-doc" (mirrors threat-data/list-threat-data vs.
    // the index average). "distractor" matches only one term but is short.
    const index = buildIndex([
      {
        chunkId: "long-doc",
        length: 848,
        terms: { list: 3, threat: 4, data: 4, indicator: 2, ctix: 1, pagination: 0 },
      },
      { chunkId: "avg-doc", length: 62, terms: { unrelated: 5, filler: 3 } },
      { chunkId: "distractor", length: 40, terms: { data: 1, statistics: 4, actions: 3 } },
    ]);

    const results = retrieveLexical("list ctix indicators threat data pagination", index, 10);
    const ranked = results.map((r) => r.id);

    expect(ranked[0]).toBe("long-doc");
  });

  it("still penalizes long docs relative to a focused short doc matching the same terms equally well", () => {
    // Same term hits, same query, but "short-doc" is close to average length.
    // With the ratio capped (not removed), the shorter, equally-matching doc
    // should still outrank the very long one.
    const index = buildIndex([
      { chunkId: "long-doc", length: 800, terms: { list: 2, indicator: 2 } },
      { chunkId: "short-doc", length: 60, terms: { list: 2, indicator: 2 } },
    ]);

    const results = retrieveLexical("list indicator", index, 10);
    expect(results[0]?.id).toBe("short-doc");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });
});
