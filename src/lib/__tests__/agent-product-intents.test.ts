import { describe, expect, it } from "vitest";
import { expandQueryForRetrieval } from "../agent/normalize-query";
import {
  enforceConnectivityPlan,
  enforceListIndicatorsPlan,
  enforceProductDocPlan,
  enforceTagManagementPlan,
  isPingQuery,
} from "../agent/planner";
import { boostEndpointMatches } from "../agent/retrieve";
import type { ScoredChunk } from "../agent/types";

const emptyPlan = { workflow: "weak", confidence: 0.1, steps: [], citations: [] as never[] };

function chunk(partial: Partial<ScoredChunk> & Pick<ScoredChunk, "slug" | "title" | "kind" | "text">): ScoredChunk {
  return {
    id: `${partial.slug}::${partial.kind}`,
    breadcrumb: [],
    score: partial.score ?? 0.5,
    lexicalScore: partial.lexicalScore ?? 0.5,
    semanticScore: 0,
    productId: partial.productId,
    ...partial,
  };
}

describe("expandQueryForRetrieval product expansions", () => {
  it("expands Orchestrate tags for plain English", () => {
    const q = expandQueryForRetrieval("In Orchestrate, how do I list all tags?", "orchestrate");
    expect(q).toMatch(/get list of tags/i);
    expect(q).toMatch(/orchestrate/i);
  });

  it("expands CSAP alerts and members", () => {
    expect(expandQueryForRetrieval("get alerts in CSAP", "csap")).toMatch(/list_alert/i);
    expect(expandQueryForRetrieval("show me CSAP members", "csap")).toMatch(/member-list-analyst/i);
  });

  it("expands CFTR incidents", () => {
    expect(expandQueryForRetrieval("list CFTR incidents", "cftr")).toMatch(/get list of incidents/i);
  });

  it("expands CTIX threat indicators", () => {
    expect(expandQueryForRetrieval("show threat indicators from last week", "ctix")).toMatch(
      /list threat data/i
    );
  });

  it("expands Orchestrate apps and playbooks", () => {
    expect(expandQueryForRetrieval("what apps are installed", "orchestrate")).toMatch(/get apps/i);
    expect(expandQueryForRetrieval("list playbooks", "orchestrate")).toMatch(/playbook filter/i);
  });

  it("maps labels to tags in retrieval expansion", () => {
    expect(expandQueryForRetrieval("list all labels", "orchestrate")).toMatch(/list tags/i);
  });
});

describe("enforceProductDocPlan — CTIX", () => {
  it("does not override tag management enforcer", () => {
    const tagPlan = enforceTagManagementPlan(emptyPlan, "how do I list tags in CTIX", []);
    expect(tagPlan.steps[0]?.slug).toBe("tags/list-tags");

    const overridden = enforceProductDocPlan(tagPlan, "how do I list tags in CTIX", [], "ctix");
    expect(overridden.steps[0]?.slug).toBe("tags/list-tags");
  });
});

describe("enforceProductDocPlan — CSAP", () => {
  it("routes alerts list", () => {
    const plan = enforceProductDocPlan(
      emptyPlan,
      "In CSAP how do I get alerts",
      [],
      "csap"
    );
    expect(plan.steps[0]?.slug).toBe("analyst-portal/analyst-portal-alerts/alerts-list-analyst-member");
    expect(plan.confidence).toBeGreaterThanOrEqual(0.92);
  });

  it("routes members list", () => {
    const plan = enforceProductDocPlan(emptyPlan, "show me CSAP members", [], "csap");
    expect(plan.steps[0]?.slug).toBe("analyst-portal/member/member-list-analyst");
  });

  it("routes intel categories", () => {
    const plan = enforceProductDocPlan(
      emptyPlan,
      "list intel categories in CSAP",
      [],
      "csap"
    );
    expect(plan.steps[0]?.slug).toBe("analyst-portal/intel/intel-categories-list-analyst-member");
  });
});

describe("enforceProductDocPlan — Orchestrate", () => {
  it("routes tags list for plain English prompt", () => {
    const plan = enforceProductDocPlan(
      emptyPlan,
      "In Orchestrate, how do I list all tags? Plain English and cURL.",
      [],
      "orchestrate"
    );
    expect(plan.steps[0]?.slug).toBe("tags/get-list-of-tags");
    expect(plan.confidence).toBeGreaterThanOrEqual(0.92);
    expect(plan.workflow).toMatch(/Get List of Tags/i);
  });

  it("routes release version", () => {
    const plan = enforceProductDocPlan(
      emptyPlan,
      "what version is orchestrate",
      [],
      "orchestrate"
    );
    expect(plan.steps[0]?.slug).toBe("authentication/product-release-version");
  });

  it("routes get apps", () => {
    const plan = enforceProductDocPlan(
      emptyPlan,
      "show orchestrate integrations",
      [],
      "orchestrate"
    );
    expect(plan.steps[0]?.slug).toBe("integrations/get-apps");
  });

  it("routes playbook list", () => {
    const plan = enforceProductDocPlan(
      emptyPlan,
      "list all playbooks in orchestrate",
      [],
      "orchestrate"
    );
    expect(plan.steps[0]?.slug).toBe("playbook/get-playbook");
  });

  it("routes labels synonym to tags", () => {
    const plan = enforceProductDocPlan(
      emptyPlan,
      "get all labels in orchestrate",
      [],
      "orchestrate"
    );
    expect(plan.steps[0]?.slug).toBe("tags/get-list-of-tags");
  });
});

describe("enforceProductDocPlan — CFTR", () => {
  it("routes incidents list", () => {
    const plan = enforceProductDocPlan(emptyPlan, "list CFTR incidents", [], "cftr");
    expect(plan.steps[0]?.slug).toBe("cftr-api-reference/incidents/get-list-of-incidents");
    expect(plan.confidence).toBeGreaterThanOrEqual(0.92);
  });
});

describe("enforceConnectivityPlan — all products", () => {
  const products = [
    { id: "ctix", slug: "ping/ping" },
    { id: "csap", slug: "analyst-portal/authentication/test-connectivity" },
    { id: "orchestrate", slug: "authentication/test-connectivity" },
    { id: "cftr", slug: "cftr-api-reference/authentication/test-connectivity" },
  ] as const;

  for (const { id, slug } of products) {
    it(`routes ${id} connectivity test`, () => {
      expect(isPingQuery("test if my credentials work")).toBe(true);
      const plan = enforceConnectivityPlan(
        emptyPlan,
        "test if my credentials work",
        [],
        id
      );
      expect(plan.steps[0]?.slug).toBe(slug);
      expect(plan.confidence).toBeGreaterThanOrEqual(0.9);
    });
  }
});

describe("enforceListIndicatorsPlan — non-technical CTIX", () => {
  it("routes threat indicators from last week", () => {
    const plan = enforceListIndicatorsPlan(
      emptyPlan,
      "I'm not technical, show threat indicators from last week",
      []
    );
    expect(plan.steps[0]?.slug).toBe("threat-data/list-threat-data");
    expect(plan.confidence).toBeGreaterThanOrEqual(0.92);
  });
});

describe("boostEndpointMatches", () => {
  it("boosts list endpoint chunks for list queries", () => {
    const scored: ScoredChunk[] = [
      chunk({
        slug: "tags/get-list-of-tags",
        title: "Get List of Tags",
        kind: "endpoint",
        method: "GET",
        path: "v1/tags/",
        text: "tags list",
        score: 0.4,
        productId: "orchestrate",
      }),
      chunk({
        slug: "tags",
        title: "Tags",
        kind: "section",
        text: "tags section overview",
        score: 0.45,
        productId: "orchestrate",
      }),
    ];

    const boosted = boostEndpointMatches(scored, "list all tags orchestrate", "orchestrate");
    expect(boosted[0]?.slug).toBe("tags/get-list-of-tags");
    expect(boosted[0]?.score).toBeGreaterThan(boosted[1]?.score ?? 0);
  });
});
