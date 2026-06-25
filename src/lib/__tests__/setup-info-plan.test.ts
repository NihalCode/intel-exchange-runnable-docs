import { describe, expect, it } from "vitest";
import {
  enforceSetupInfoPlan,
  isBaseUrlQuery,
  isCredentialsQuery,
  isSetupInfoQuery,
} from "../agent/planner";
import type { AgentPlan } from "../agent/types";

const emptyPlan: AgentPlan = {
  confidence: 0.5,
  workflow: "Generic auth advice.",
  steps: [],
  citations: [],
};

describe("isBaseUrlQuery", () => {
  it("matches CFTR tenant URL questions", () => {
    expect(
      isBaseUrlQuery("What is the live Open API base URL for our CFTR tenant?")
    ).toBe(true);
  });

  it("does not match unrelated prompts", () => {
    expect(isBaseUrlQuery("list all incidents")).toBe(false);
  });
});

describe("isCredentialsQuery", () => {
  it("matches separate keys questions", () => {
    expect(
      isCredentialsQuery(
        "will I need 8 separate keys (access id + secret key) for all 4 of these apis?"
      )
    ).toBe(true);
  });
});

describe("isSetupInfoQuery", () => {
  it("covers base URL and credentials prompts", () => {
    expect(isSetupInfoQuery("what is the base url for cftr")).toBe(true);
    expect(isSetupInfoQuery("do I need separate credentials for each api")).toBe(true);
  });
});

describe("enforceSetupInfoPlan", () => {
  it("returns CFTR base URL with high confidence", () => {
    const plan = enforceSetupInfoPlan(
      emptyPlan,
      "What is the live Open API base URL for our CFTR tenant?",
      "cftr"
    );

    expect(plan.confidence).toBeGreaterThanOrEqual(0.9);
    expect(plan.workflow).toContain("https://cftrapi.cyware.com");
    expect(plan.workflow).toContain("CFTR");
    expect(plan.steps[0]?.slug).toBe(
      "cftr-api-reference/authentication/test-connectivity"
    );
  });

  it("lists all product base URLs when scope is all", () => {
    const plan = enforceSetupInfoPlan(
      emptyPlan,
      "what are the base urls for all cyware apis",
      "all"
    );

    expect(plan.workflow).toContain("https://cftrapi.cyware.com");
    expect(plan.workflow).toContain("https://csapapi.cyware.com");
    expect(plan.workflow).toContain("https://orchestrateapi.cyware.com");
    expect(plan.workflow).toContain("four pairs");
    expect(plan.steps).toHaveLength(0);
  });

  it("answers credentials-only questions for a single product", () => {
    const plan = enforceSetupInfoPlan(
      emptyPlan,
      "can I use my CTIX access id for CFTR?",
      "cftr"
    );

    expect(plan.workflow).toContain("cannot reuse CTIX credentials");
    expect(plan.workflow).toContain("https://cftrapi.cyware.com");
  });
});
