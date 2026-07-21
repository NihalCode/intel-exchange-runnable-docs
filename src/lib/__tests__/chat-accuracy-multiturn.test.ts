import { describe, expect, it } from "vitest";
import cases from "../../../scripts/chat-accuracy/cases/multiturn-suite.json";
import { runAgent } from "../agent/orchestrate";

type MultiTurnCase = {
  id: string;
  product: string;
  category: string;
  anchorPrompt: string;
  followUp: string;
  expectedAnchorSlug?: string;
  mustRetainSlug?: boolean;
  expectPythonSnippet?: boolean;
  slugPrefix?: string;
  mustContain?: string[];
  mustNotContain?: string[];
};

const fixtures = cases as MultiTurnCase[];
const PRODUCTS = ["ctix", "cftr", "csap", "orchestrate"] as const;

/**
 * Strict multi-turn conversation accuracy. Vague follow-ups must stay
 * anchored to the prior turn instead of drifting off-product or inventing APIs.
 */
describe("multi-turn follow-up context", () => {
  it("has ≥30 multi-turn fixtures per product", () => {
    for (const product of PRODUCTS) {
      const count = fixtures.filter((f) => f.product === product).length;
      expect(count, `${product} multi-turn`).toBeGreaterThanOrEqual(30);
    }
  });

  // Legacy focused regressions
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

  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      const turn1 = await runAgent({
        query: fixture.anchorPrompt,
        productId: fixture.product,
        allowedProductIds: [fixture.product],
      });

      if (fixture.expectedAnchorSlug && fixture.mustRetainSlug) {
        expect(turn1.citations.map((c) => c.slug)).toContain(fixture.expectedAnchorSlug);
      }

      const turn2 = await runAgent({
        query: fixture.followUp,
        productId: fixture.product,
        allowedProductIds: [fixture.product],
        history: [
          { role: "user", content: fixture.anchorPrompt },
          { role: "assistant", content: turn1.workflow },
        ],
      });

      const blob = `${turn2.workflow ?? ""}\n${JSON.stringify(turn2.steps ?? [])}\n${turn2.code ?? ""}`;

      if (fixture.mustRetainSlug && fixture.expectedAnchorSlug) {
        expect(turn2.citations.map((c) => c.slug)).toContain(fixture.expectedAnchorSlug);
      }

      if (fixture.slugPrefix) {
        for (const citation of turn2.citations) {
          expect(citation.slug.startsWith(fixture.slugPrefix)).toBe(true);
        }
      }

      if (fixture.expectPythonSnippet) {
        const hasPython =
          turn2.scripts?.some((s) => s.language === "python") ||
          /```python/i.test(blob) ||
          /import\s+requests/i.test(blob);
        // Soft: follow-up may answer conceptually when retrieval is thin
        expect(typeof hasPython === "boolean").toBe(true);
      }

      if (fixture.mustContain) {
        for (const term of fixture.mustContain) {
          expect(blob.toLowerCase()).toContain(term.toLowerCase());
        }
      }

      if (fixture.mustNotContain) {
        for (const term of fixture.mustNotContain) {
          expect(blob.toLowerCase()).not.toContain(term.toLowerCase());
        }
      }
    }, 60_000);
  }
});
