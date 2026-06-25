import { describe, expect, it } from "vitest";
import { resolveProductScope } from "../agent/product-scope";
import {
  enforceCatalogPlan,
  enforceProductDocPlan,
  isCatalogQuery,
} from "../agent/planner";
import { inferProductFromQuery } from "../products/registry";

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
});

describe("resolveProductScope", () => {
  it("prefers explicit product in query over UI productId", () => {
    expect(
      resolveProductScope(
        { query: "CFTR: list incidents", productId: "ctix" },
        "CFTR: list incidents"
      )
    ).toBe("cftr");
  });

  it("uses UI productId when query is ambiguous", () => {
    expect(resolveProductScope({ query: "list tags", productId: "ctix" }, "list tags")).toBe("ctix");
  });
});

describe("enforceCatalogPlan", () => {
  it("lists all four products", () => {
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
