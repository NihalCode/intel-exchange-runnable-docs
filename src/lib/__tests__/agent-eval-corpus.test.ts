import { describe, expect, it } from "vitest";
import { degradedRetrievalNotice, evidenceLabel } from "../agent/answer-ux";
import { resolveAgentIntent } from "../agent/intent";
import { LlmPlanContractError, validateLlmPlanPayload } from "../agent/llm-contract";
import { productScopeForFilter, resolveProductScope } from "../agent/product-scope";
import { retrieveLexical } from "../agent/retrieve";
import type { AgentIndex } from "../agent/types";
import { buildProductAccessDeniedResponse } from "../documentation-credentials/access";

/**
 * Versioned, deterministic regression fixtures for high-risk agent routing and
 * plan-boundary behavior. Add new fixtures rather than changing expectations
 * without intentionally advancing the corpus version.
 */
const AGENT_EVAL_CORPUS_VERSION = 2;

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

const RETRIEVAL_FIXTURE: AgentIndex = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  chunkCount: 2,
  hasEmbeddings: false,
  chunks: [
    {
      id: "ping/ping::endpoint",
      slug: "ping/ping",
      title: "Ping",
      kind: "endpoint",
      method: "GET",
      path: "/ping/",
      breadcrumb: ["Ping"],
      text: "Ping GET /ping/ health check connectivity",
    },
    {
      id: "threat-data/list-threat-data::endpoint",
      slug: "threat-data/list-threat-data",
      title: "Get Threat Data List",
      kind: "endpoint",
      method: "POST",
      path: "/ingestion/threat-data/list/",
      breadcrumb: ["Threat Data"],
      text: "Get Threat Data List POST /ingestion/threat-data/list/ indicators search",
    },
  ],
  lexical: {
    docCount: 2,
    avgDocLen: 6,
    df: {
      ping: 1,
      "/ping/": 1,
      health: 1,
      check: 1,
      connectivity: 1,
      threat: 1,
      data: 1,
      list: 1,
      indicators: 1,
      search: 1,
    },
    docs: [
      {
        chunkId: "ping/ping::endpoint",
        length: 6,
        terms: { ping: 1, "/ping/": 1, health: 1, check: 1, connectivity: 1, get: 1 },
      },
      {
        chunkId: "threat-data/list-threat-data::endpoint",
        length: 6,
        terms: { threat: 1, data: 1, list: 1, indicators: 1, search: 1, post: 1 },
      },
    ],
  },
};

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
      { query: "Compare CTIX and CFTR API authentication requirements", productId: "ctix" },
      "Compare CTIX and CFTR API authentication requirements"
    );

    expect(scope.filterMode).toBe("multi");
    expect(scope.productIds).toEqual(expect.arrayContaining(["ctix", "cftr"]));
    expect(productScopeForFilter(scope)).toBe("all");
  });

  it("denies disconnected product questions with the shared access response helper", () => {
    const scope = resolveProductScope(
      { query: "In CFTR, how do I list incidents?", productId: "ctix" },
      "In CFTR, how do I list incidents?",
      { allowedProductIds: ["ctix"] }
    );
    const response = buildProductAccessDeniedResponse(
      scope.accessViolation!.deniedProductIds,
      scope.accessViolation!.allowedProductIds
    );

    expect(scope.accessViolation).toEqual({
      deniedProductIds: ["cftr"],
      allowedProductIds: ["ctix"],
    });
    expect(response.code).toBe("PRODUCT_NOT_AUTHORIZED");
    expect(response.steps).toEqual([]);
    expect(response.workflow).toContain("Not connected: CFTR");
  });

  it("maps evidence to coarse labels rather than raw ranking percentages", () => {
    const labels = [
      evidenceLabel("strong_match"),
      evidenceLabel("partial_match"),
      evidenceLabel("limited_evidence"),
      evidenceLabel("no_verified_match"),
    ];

    expect(labels).toEqual([
      "Strong documentation match",
      "Relevant documentation found",
      "Limited documentation evidence",
      "No verified documentation match",
    ]);
    expect(labels.every((label) => !/%|\b\d+(?:\.\d+)?\b/.test(label ?? ""))).toBe(true);
    expect(degradedRetrievalNotice(true)).toContain("local index");
    expect(degradedRetrievalNotice(false)).toBeUndefined();
  });

  it("rejects malformed, junk, and oversized LLM plan payloads at the contract boundary", () => {
    expect(() => validateLlmPlanPayload({ steps: "not-an-array" }, ALLOWED_SLUGS))
      .toThrow(LlmPlanContractError);
    expect(() =>
      validateLlmPlanPayload({ ...validPlanPayload(), unexpected: "model junk" }, ALLOWED_SLUGS)
    ).toThrow(LlmPlanContractError);
    expect(() =>
      validateLlmPlanPayload(
        {
          ...validPlanPayload(),
          steps: [{ ...validPlanPayload().steps[0], slug: "not-a-documented-endpoint" }],
        },
        ALLOWED_SLUGS
      )
    ).toThrow(LlmPlanContractError);
    expect(() =>
      validateLlmPlanPayload({ ...validPlanPayload(), confidence: Number.NaN }, ALLOWED_SLUGS)
    ).toThrow(LlmPlanContractError);
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

  it.each([
    ["ping", "ping/ping"],
    ["GET /ping/", "ping/ping"],
  ])("ranks the exact local endpoint for %s", (query, expectedSlug) => {
    expect(retrieveLexical(query, RETRIEVAL_FIXTURE, 1)[0]?.slug).toBe(expectedSlug);
  });
});
