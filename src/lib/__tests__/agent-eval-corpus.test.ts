import { describe, expect, it } from "vitest";
import { degradedRetrievalNotice, evidenceLabel } from "../agent/answer-ux";
import { resolveAgentIntent } from "../agent/intent";
import { LlmPlanContractError, validateLlmPlanPayload } from "../agent/llm-contract";
import { productScopeForFilter, resolveProductScope } from "../agent/product-scope";

/**
 * Versioned, deterministic regression fixtures for high-risk agent routing and
 * plan-boundary behavior. Add new fixtures rather than changing expectations
 * without intentionally advancing the corpus version.
 */
const AGENT_EVAL_CORPUS_VERSION = 1;

const GOLDEN_INTENT_FIXTURES = [
  {
    name: "conceptual CTIX question remains a documentation workflow",
    query: "What does CTIX indicator export do?",
    hasProjectFiles: true,
    expectedIntent: "workflow",
  },
  {
    name: "HTTP 404 troubleshooting remains a workflow with a loaded app",
    query: "I get a 404 exporting indicators after the upgrade. Fix this.",
    hasProjectFiles: true,
    expectedIntent: "workflow",
  },
  {
    name: "an explicit app/page.tsx change edits the loaded app",
    query: "Change app/page.tsx to add a status filter.",
    hasProjectFiles: true,
    expectedIntent: "app_edit",
  },
] as const;

const ALLOWED_SLUGS = new Set(["threat-data/list-threat-data"]);

function validPlanPayload() {
  return {
    workflow: "List documented CTIX indicators.",
    confidence: 0.8,
    steps: [
      {
        slug: "threat-data/list-threat-data",
        order: 1,
        explanation: "Use the documented endpoint.",
      },
    ],
    questions: [],
  };
}

describe(`agent regression eval corpus v${AGENT_EVAL_CORPUS_VERSION}`, () => {
  it.each(GOLDEN_INTENT_FIXTURES)("$name", ({ query, hasProjectFiles, expectedIntent }) => {
    const result = resolveAgentIntent(query, { hasProjectFiles });

    expect(result.intent).toBe(expectedIntent);
    if (expectedIntent === "workflow") {
      expect(result.editExistingApp).toBe(false);
    }
  });

  it("lets an explicitly named CFTR query override the CTIX product selector", () => {
    const scope = resolveProductScope(
      { query: "In CFTR, how do I list incidents?", productId: "ctix" },
      "In CFTR, how do I list incidents?"
    );

    expect(scope.primaryProductId).toBe("cftr");
    expect(scope.source).toBe("query");
    expect(scope.productIds).toEqual(["cftr"]);
  });

  it("keeps cross-product comparison queries in multi-product retrieval", () => {
    const scope = resolveProductScope(
      { query: "Compare CTIX indicators with Orchestrate playbooks", productId: "cftr" },
      "Compare CTIX indicators with Orchestrate playbooks"
    );

    expect(scope.filterMode).toBe("multi");
    expect(scope.productIds).toEqual(expect.arrayContaining(["ctix", "orchestrate"]));
    expect(productScopeForFilter(scope)).toBe("all");
  });

  it("maps coarse retrieval evidence and degraded state to safe UI copy", () => {
    expect(evidenceLabel("strong_match")).toBe("Strong documentation match");
    expect(evidenceLabel("no_verified_match")).toBe("No verified documentation match");
    expect(degradedRetrievalNotice(true)).toContain("local index");
    expect(degradedRetrievalNotice(false)).toBeUndefined();
  });

  it("rejects malformed and oversized LLM plan payloads at the contract boundary", () => {
    expect(() => validateLlmPlanPayload({ steps: "not-an-array" }, ALLOWED_SLUGS))
      .toThrow(LlmPlanContractError);
    expect(() =>
      validateLlmPlanPayload(
        { ...validPlanPayload(), workflow: "x".repeat(12_001) },
        ALLOWED_SLUGS
      )
    ).toThrow(LlmPlanContractError);
    expect(() =>
      validateLlmPlanPayload(
        {
          ...validPlanPayload(),
          steps: Array.from({ length: 13 }, () => validPlanPayload().steps[0]),
        },
        ALLOWED_SLUGS
      )
    ).toThrow(LlmPlanContractError);
  });
});
