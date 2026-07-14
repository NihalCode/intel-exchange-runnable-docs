import { describe, expect, it } from "vitest";
import {
  enforceRateLimitGuidancePlan,
  isRateLimitQuery,
} from "../agent/planner";
import type { AgentPlan } from "../agent/types";

const pollutedPlan: AgentPlan = {
  confidence: 0.75,
  workflow: "Call Get Actions List",
  steps: [
    {
      slug: "threat-data-objects/actions/list-actions",
      order: 2,
      explanation: "Wrong endpoint for 429 guidance",
    },
  ],
  citations: [
    {
      slug: "threat-data-objects/actions/list-actions",
      title: "Get Actions List",
      url: "/docs/threat-data-objects/actions/list-actions",
    },
  ],
};

describe("isRateLimitQuery", () => {
  it("matches 429 / rate-limit troubleshooting prompts", () => {
    expect(isRateLimitQuery("How should I handle CTIX 429 responses?")).toBe(true);
    expect(isRateLimitQuery("What do I do when rate limited?")).toBe(true);
    expect(isRateLimitQuery("too many requests from the API")).toBe(true);
  });

  it("does not match unrelated prompts", () => {
    expect(isRateLimitQuery("List threat data indicators")).toBe(false);
    expect(isRateLimitQuery("Get Actions List")).toBe(false);
  });
});

describe("enforceRateLimitGuidancePlan", () => {
  it("clears unrelated endpoint steps and gives client retry guidance", () => {
    const plan = enforceRateLimitGuidancePlan(
      pollutedPlan,
      "How should I handle CTIX 429 responses?"
    );

    expect(plan.confidence).toBeGreaterThanOrEqual(0.9);
    expect(plan.steps).toEqual([]);
    expect(plan.citations).toEqual([]);
    expect(plan.workflow).toMatch(/429/);
    expect(plan.workflow).toMatch(/Retry-After/);
    expect(plan.workflow).not.toMatch(/Get Actions List/);
  });

  it("leaves non-rate-limit plans unchanged", () => {
    const plan = enforceRateLimitGuidancePlan(pollutedPlan, "List threat indicators");
    expect(plan).toBe(pollutedPlan);
  });
});
