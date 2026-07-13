import { describe, expect, it } from "vitest";
import { resolveProductScope } from "../agent/product-scope";
import {
  enforceCatalogPlan,
  enforceListIndicatorsPlan,
  enforceProductDocPlan,
  isCatalogQuery,
} from "../agent/planner";
import { inferProductFromQuery, inferProductsFromQuery } from "../products/registry";

describe("inferProductsFromQuery", () => {
  it("detects single product mentions", () => {
    expect(inferProductsFromQuery("In CSAP, how do I fetch alerts?")).toEqual(["csap"]);
    expect(inferProductsFromQuery("Show CFTR indicator snippet")).toEqual(["cftr"]);
    expect(inferProductsFromQuery("CTIX threat indicators")).toEqual(["ctix"]);
  });

  it("detects multiple products", () => {
    const ids = inferProductsFromQuery("Compare CTIX indicators with Orchestrate playbooks");
    expect(ids).toContain("ctix");
    expect(ids).toContain("orchestrate");
  });

  it("returns empty when no product mentioned", () => {
    expect(inferProductsFromQuery("list tags")).toEqual([]);
  });
});

describe("inferProductFromQuery", () => {
  it("parses numbered tour prompts", () => {
    expect(inferProductFromQuery("3. CFTR: how do I list incidents? docs review only")).toBe("cftr");
    expect(inferProductFromQuery("4. CSAP: how do I get analyst portal alerts?")).toBe("csap");
    expect(inferProductFromQuery("5. Orchestrate: product release version endpoint?")).toBe(
      "orchestrate"
    );
  });

  it("detects catalog questions", () => {
    expect(inferProductFromQuery("1. What products are documented here?")).toBe("all");
    expect(isCatalogQuery("What products are documented here?")).toBe(true);
  });

  it("does not treat STIX-only queries as CSAP when CSAP not mentioned", () => {
    expect(inferProductFromQuery("list STIX indicators")).toBe("ctix");
  });

  it("returns all when multiple products mentioned", () => {
    expect(inferProductFromQuery("CTIX and CSAP alerts")).toBe("all");
  });
});

describe("resolveProductScope", () => {
  it("prefers explicit product in query over UI productId", () => {
    const scope = resolveProductScope(
      { query: "CFTR: list incidents", productId: "ctix" },
      "CFTR: list incidents"
    );
    expect(scope.primaryProductId).toBe("cftr");
    expect(scope.source).toBe("query");
    expect(scope.label).toMatch(/CFTR.*your question/i);
  });

  it("uses UI productId when query is ambiguous", () => {
    const scope = resolveProductScope({ query: "list tags", productId: "ctix" }, "list tags");
    expect(scope.primaryProductId).toBe("ctix");
    expect(scope.source).toBe("dropdown");
  });

  it("supports multi-product scope from query", () => {
    const scope = resolveProductScope(
      { query: "CTIX indicators and Orchestrate workflows", productId: "csap" },
      "CTIX indicators and Orchestrate workflows"
    );
    expect(scope.filterMode).toBe("multi");
    expect(scope.productIds).toContain("ctix");
    expect(scope.productIds).toContain("orchestrate");
  });
});

describe("enforceCatalogPlan", () => {
  it("lists all four products when no allowlist is provided", () => {
    const plan = enforceCatalogPlan(
      { workflow: "", confidence: 0, steps: [], citations: [] },
      "What products are documented here?"
    );
    expect(plan.confidence).toBeGreaterThan(0.9);
    expect(plan.workflow).toMatch(/CFTR/);
    expect(plan.workflow).toMatch(/CSAP/);
    expect(plan.workflow).toMatch(/Orchestrate/);
    expect(plan.citations.length).toBe(4);
  });
});

describe("enforceProductDocPlan", () => {
  it("routes CFTR incident list questions", () => {
    const plan = enforceProductDocPlan(
      { workflow: "weak", confidence: 0.1, steps: [], citations: [] },
      "how do I list incidents in CFTR?",
      [],
      "cftr"
    );
    expect(plan.steps[0]?.slug).toBe("cftr-api-reference/incidents/get-list-of-incidents");
    expect(plan.confidence).toBeGreaterThan(0.9);
  });

  it("routes Orchestrate release version", () => {
    const plan = enforceProductDocPlan(
      { workflow: "weak", confidence: 0.2, steps: [], citations: [] },
      "product release version endpoint?",
      [],
      "orchestrate"
    );
    expect(plan.steps[0]?.slug).toBe("authentication/product-release-version");
  });
});

describe("enforceListIndicatorsPlan", () => {
  const TEST_QUERY =
    "I'm not technical. In CTIX, how do I get a list of threat indicators from the last 7 days? Tell me step by step what to ask for, what settings I need, and show me example code I could give to my IT team — in plain English.";

  it("uses non-technical template for CTIX last-7-days indicators", () => {
    const plan = enforceListIndicatorsPlan(
      { workflow: "", confidence: 0.2, steps: [], citations: [] },
      TEST_QUERY,
      []
    );
    expect(plan.questions).toBeUndefined();
    expect(plan.workflow).toMatch(/What you're trying to do/i);
    expect(plan.workflow).toMatch(/ingestion\/threat-data\/list/i);
    expect(plan.workflow).toMatch(/Example cURL/i);
    expect(plan.workflow).not.toMatch(/report id/i);
    expect(plan.workflow).not.toMatch(/recipient/i);
    expect(plan.steps[0]?.slug).toBe("threat-data/list-threat-data");
    expect(plan.steps[0]?.params?.body?.query).toMatch(/indicator/);
    expect(plan.steps[0]?.params?.body?.query).toMatch(/START_TIME/);
  });
});
