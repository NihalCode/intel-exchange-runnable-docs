import { describe, expect, it } from "vitest";
import {
  enforceOpenApiAuthPlan,
  enforceSetupInfoPlan,
  isBaseUrlQuery,
  isCredentialsQuery,
  isOpenApiAuthHowToQuery,
  isSetupInfoQuery,
} from "../agent/planner";
import type { AgentPlan } from "../agent/types";
import { runAgent } from "../agent/orchestrate";

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
    expect(isCredentialsQuery("Does each product need its own API keys?")).toBe(true);
  });
});

describe("enforceSetupInfoPlan credentials lead", () => {
  it("leads with own-keys guidance for credentials-only prompts", () => {
    const plan = enforceSetupInfoPlan(
      emptyPlan,
      "Does each product need its own API keys?",
      "cftr"
    );
    expect(plan.workflow).toMatch(/^\*\*Yes — use each product/i);
    expect(plan.workflow).toMatch(/own.*separate/i);
  });
});

describe("isSetupInfoQuery", () => {
  it("covers base URL and credentials prompts", () => {
    expect(isSetupInfoQuery("what is the base url for cftr")).toBe(true);
    expect(isSetupInfoQuery("do I need separate credentials for each api")).toBe(true);
  });
});

describe("isOpenApiAuthHowToQuery", () => {
  it("matches how-to authenticate and required query param phrasing", () => {
    expect(
      isOpenApiAuthHowToQuery(
        "How do I authenticate a CTIX Open API request? List the required query parameters."
      )
    ).toBe(true);
    expect(isOpenApiAuthHowToQuery("How does CTIX Open API authentication work?")).toBe(true);
  });

  it("does not steal connectivity or base-url prompts", () => {
    expect(isOpenApiAuthHowToQuery("test my CTIX API connection")).toBe(false);
    expect(isOpenApiAuthHowToQuery("what is the base url for cftr")).toBe(false);
  });
});

describe("HTTP status meaning guidance", () => {
  it("answers 401 without inventing an authentication endpoint", async () => {
    const { isHttpStatusMeaningQuery, enforceHttpStatusGuidancePlan } = await import(
      "../agent/planner"
    );
    expect(
      isHttpStatusMeaningQuery("What does a 401 mean on a CTIX Open API call?")
    ).toBe(true);
    const plan = enforceHttpStatusGuidancePlan(emptyPlan, "What does a 401 mean on a CTIX Open API call?");
    expect(plan.workflow).toContain("401");
    expect(plan.workflow).toContain("AccessID");
    expect(plan.steps).toHaveLength(0);
  });
});

describe("enforceOpenApiAuthPlan", () => {
  it("answers with AccessID Signature Expires and ping verification", () => {
    const badLlmPlan: AgentPlan = {
      confidence: 0.8,
      workflow: "Use the authentication endpoint.",
      steps: [{ slug: "authentication", order: 1, explanation: "auth" }],
      citations: [],
    };
    const plan = enforceOpenApiAuthPlan(
      badLlmPlan,
      "How do I authenticate a CTIX Open API request? List the required query parameters.",
      "ctix"
    );
    expect(plan.confidence).toBeGreaterThanOrEqual(0.9);
    expect(plan.workflow).toContain("AccessID");
    expect(plan.workflow).toContain("Signature");
    expect(plan.workflow).toContain("Expires");
    expect(plan.workflow).toContain("HMAC-SHA1");
    expect(plan.workflow).not.toMatch(/SecretKey=/);
    expect(plan.steps[0]?.slug).toBe("ping/ping");
    expect(plan.citations.some((c) => c.slug === "authentication")).toBe(true);
  });
});

describe("runAgent Open API auth how-to (Wave D regression)", () => {
  it("does not abstain on authenticate how-to phrasing", async () => {
    const response = await runAgent({
      query:
        "How do I authenticate a CTIX Open API request? List the required query parameters.",
      productId: "ctix",
      allowedProductIds: ["ctix"],
    });
    expect(response.workflow).toContain("AccessID");
    expect(response.workflow).toContain("Signature");
    expect(response.workflow).toContain("Expires");
    expect(response.workflow).not.toMatch(/I can[’']t verify/i);
    expect(response.fallback).toBe(false);
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
