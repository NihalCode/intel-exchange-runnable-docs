import { describe, expect, it } from "vitest";
import {
  LLM_PLAN_SCHEMA_VERSION,
  LlmPlanContractError,
  validateLlmPlanPayload,
} from "../agent/llm-contract";

const allowedSlugs = new Set(["threat-data/list-threat-data"]);

function validPayload() {
  return {
    workflow: "List the documented indicators.",
    confidence: 0.8,
    steps: [
      {
        slug: "threat-data/list-threat-data",
        order: 1,
        explanation: "Use the documented endpoint.",
        queryParams: { page_size: "100" },
        body: { query: 'type = "indicator"' },
      },
    ],
    questions: [],
  };
}

describe("LLM plan contract v1", () => {
  it("accepts a bounded documented plan and maps executable parameter sections", () => {
    const result = validateLlmPlanPayload(validPayload(), allowedSlugs);

    expect(LLM_PLAN_SCHEMA_VERSION).toBe(1);
    expect(result.steps[0]).toMatchObject({
      slug: "threat-data/list-threat-data",
      params: {
        query: { page_size: "100" },
        body: { query: 'type = "indicator"' },
      },
    });
  });

  it("rejects malformed plans, unknown executable fields, and undocumented slugs", () => {
    expect(() => validateLlmPlanPayload({ steps: "not-an-array" }, allowedSlugs))
      .toThrow(LlmPlanContractError);
    expect(() => validateLlmPlanPayload(
      { ...validPayload(), dangerousOverride: true },
      allowedSlugs
    )).toThrow(LlmPlanContractError);
    expect(() => validateLlmPlanPayload(
      {
        ...validPayload(),
        steps: [{ ...validPayload().steps[0], slug: "admin/delete-everything" }],
      },
      allowedSlugs
    )).toThrow(LlmPlanContractError);
  });

  it("rejects overlarge strings and arrays before they reach executable steps", () => {
    expect(() => validateLlmPlanPayload(
      { ...validPayload(), workflow: "x".repeat(12_001) },
      allowedSlugs
    )).toThrow(LlmPlanContractError);
    expect(() => validateLlmPlanPayload(
      { ...validPayload(), steps: Array.from({ length: 13 }, () => validPayload().steps[0]) },
      allowedSlugs
    )).toThrow(LlmPlanContractError);
    expect(() => validateLlmPlanPayload(
      {
        ...validPayload(),
        steps: [{
          ...validPayload().steps[0],
          queryParams: { page_size: "x".repeat(2_001) },
        }],
      },
      allowedSlugs
    )).toThrow(LlmPlanContractError);
  });
});
