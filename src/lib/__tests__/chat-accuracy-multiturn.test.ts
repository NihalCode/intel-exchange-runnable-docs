import { describe, expect, it } from "vitest";
import { runAgent } from "../agent/orchestrate";

/**
 * Strict multi-turn conversation accuracy (Phase 5 of the strict testing
 * prompt). A vague follow-up ("what about pagination for that?", "show me a
 * Python example for that") must stay anchored to the topic established by
 * the prior turn instead of drifting to unrelated endpoints. Regression for
 * the BM25 length-normalization bug fixed in retrieve.ts (see
 * bm25-length-normalization.test.ts for the isolated unit repro).
 */

describe("multi-turn follow-up context (Phase 5)", () => {
  it("keeps the anchor endpoint when a vague CTIX follow-up references 'that'", async () => {
    const turn1 = await runAgent({ query: "How do I list CTIX indicators?", productId: "ctix" });
    expect(turn1.citations.map((c) => c.slug)).toContain("threat-data/list-threat-data");

    const turn2 = await runAgent({
      query: "What about pagination for that?",
      productId: "ctix",
      history: [
        { role: "user", content: "How do I list CTIX indicators?" },
        { role: "assistant", content: turn1.workflow },
      ],
    });

    expect(
      turn2.citations.map((c) => c.slug),
      `follow-up lost the anchor endpoint; got ${JSON.stringify(turn2.citations.map((c) => c.slug))}`
    ).toContain("threat-data/list-threat-data");
  });

  it("carries the anchor endpoint into a follow-up snippet request", async () => {
    const turn1 = await runAgent({ query: "How do I list CTIX indicators?", productId: "ctix" });

    const turn2 = await runAgent({
      query: "Show me a Python example for that.",
      productId: "ctix",
      history: [
        { role: "user", content: "How do I list CTIX indicators?" },
        { role: "assistant", content: turn1.workflow },
      ],
    });

    expect(turn2.citations.map((c) => c.slug)).toContain("threat-data/list-threat-data");
    expect(turn2.scripts?.some((s) => s.language === "python")).toBe(true);
  });

  it("stays in CFTR scope across a vague incident follow-up", async () => {
    const turn1 = await runAgent({ query: "How do I retrieve incident details?", productId: "cftr" });

    const turn2 = await runAgent({
      query: "What about filtering by status?",
      productId: "cftr",
      history: [
        { role: "user", content: "How do I retrieve incident details?" },
        { role: "assistant", content: turn1.workflow },
      ],
    });

    for (const citation of turn2.citations) {
      expect(citation.slug.startsWith("cftr-api-reference/")).toBe(true);
    }
  });
});
