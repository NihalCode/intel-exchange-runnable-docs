import { describe, expect, it } from "vitest";
import {
  enforceConnectivityPlan,
  isPingQuery,
} from "../agent/planner";
import type { AgentPlan, ScoredChunk } from "../agent/types";

const emptyPlan: AgentPlan = {
  confidence: 0.5,
  workflow: "Generic auth advice.",
  steps: [],
  citations: [],
};

const chunk = (slug: string, title: string, kind: ScoredChunk["kind"] = "section"): ScoredChunk => ({
  id: slug,
  slug,
  title,
  kind,
  breadcrumb: [],
  text: title,
  score: 0.8,
  lexicalScore: 0.8,
  semanticScore: 0,
  productId: "cftr",
});

const authChunk = chunk("cftr-api-reference/authentication", "Authentication");

describe("isPingQuery", () => {
  it("matches CFTR credential test prompts", () => {
    expect(
      isPingQuery("CFTR: test if my API connection and credentials are working")
    ).toBe(true);
  });
});

describe("enforceConnectivityPlan", () => {
  it("routes CFTR connectivity prompts to test-connectivity even without retrieval", () => {
    const plan = enforceConnectivityPlan(
      emptyPlan,
      "CFTR: test if my API connection and credentials are working",
      [authChunk],
      "cftr"
    );

    expect(plan.confidence).toBeGreaterThanOrEqual(0.9);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].slug).toBe("cftr-api-reference/authentication/test-connectivity");
    expect(plan.citations[0].url).toBe(
      "/docs/cftr/cftr-api-reference/authentication/test-connectivity"
    );
  });

  it("routes CTIX connectivity prompts to ping", () => {
    const plan = enforceConnectivityPlan(
      emptyPlan,
      "is the connection working?",
      [],
      "ctix"
    );

    expect(plan.steps[0].slug).toBe("ping/ping");
    expect(plan.citations[0].url).toBe("/docs/ping/ping");
  });
});
