import { describe, it, expect } from "vitest";
import { unsupportedEndpointAbstention, validatePlan, validateStep } from "../agent/validate";
import type { EndpointPage } from "../types";
import type { AgentPlan } from "../agent/types";

const PAGE: EndpointPage = {
  slug: "intel/create",
  title: "Create Intel",
  kind: "endpoint",
  breadcrumb: ["Intel"],
  description: "Create intel",
  method: "POST",
  path: "/v3/intel/create/",
  request: {
    query: [{ name: "page", value: "1" }],
    body: [{ name: "title", value: "Test", isRequired: true }],
    path: [{ name: "id", value: "" }],
  },
  responses: [],
};

const LIST_PAGE: EndpointPage = {
  ...PAGE,
  slug: "intel/list",
  title: "List Intel",
  method: "GET",
  path: "/v3/intel/",
};

const SLUGS = new Set(["intel/create"]);

describe("validateStep", () => {
  it("accepts known params and drops unknown ones", () => {
    const result = validateStep(
      {
        slug: "intel/create",
        order: 1,
        explanation: "Create intel",
        params: {
          query: { page: "2", bogus: "x" },
          body: { title: "Hello", extra: true },
          path: { id: "abc" },
        },
      },
      PAGE,
      SLUGS
    );
    expect(result).not.toBeNull();
    expect(result!.params.query).toEqual({ page: "2" });
    expect(result!.params.body).toEqual({ title: "Hello" });
    expect(result!.params.path).toEqual({ id: "abc" });
    expect(result!.warnings.some((w) => w.includes("bogus"))).toBe(true);
    expect(result!.warnings.some((w) => w.includes("extra"))).toBe(true);
  });

  it("rejects unknown slugs", () => {
    const result = validateStep(
      { slug: "fake/endpoint", order: 1, explanation: "nope" },
      PAGE,
      SLUGS
    );
    expect(result).toBeNull();
  });

  it("returns an explicit abstention instead of an invented request path", () => {
    const message = unsupportedEndpointAbstention(["fake/endpoint"]);

    expect(message).toContain("`fake/endpoint`");
    expect(message).toContain("won’t suggest a request path");
    expect(message).toContain("TODO:");
  });
});

describe("validatePlan step renumbering", () => {
  it("renumbers surviving steps to contiguous 1..n after drops", () => {
    const plan: AgentPlan = {
      confidence: 0.75,
      workflow: "Mixed plan",
      citations: [],
      steps: [
        { slug: "missing/first", order: 1, explanation: "dropped" },
        { slug: "intel/list", order: 2, explanation: "kept" },
        { slug: "also/missing", order: 3, explanation: "dropped" },
      ],
    };
    const pages = new Map<string, EndpointPage>([["intel/list", LIST_PAGE]]);
    const endpointSlugs = new Set(["intel/list", "missing/first", "also/missing"]);

    const { steps, dropped } = validatePlan(plan, pages, endpointSlugs);

    expect(dropped).toEqual(["missing/first", "also/missing"]);
    expect(steps).toHaveLength(1);
    expect(steps[0].slug).toBe("intel/list");
    expect(steps[0].order).toBe(1);
  });

  it("preserves relative order while renumbering multiple survivors", () => {
    const second: EndpointPage = {
      ...LIST_PAGE,
      slug: "intel/create",
      title: "Create",
      path: "/v3/intel/create/",
    };
    const plan: AgentPlan = {
      confidence: 0.8,
      workflow: "Two steps",
      citations: [],
      steps: [
        { slug: "intel/list", order: 2, explanation: "list" },
        { slug: "gone", order: 1, explanation: "drop" },
        { slug: "intel/create", order: 5, explanation: "create" },
      ],
    };
    const pages = new Map<string, EndpointPage>([
      ["intel/list", LIST_PAGE],
      ["intel/create", second],
    ]);

    const { steps, dropped } = validatePlan(plan, pages, new Set(["intel/list", "intel/create"]));

    expect(dropped).toEqual(["gone"]);
    expect(steps.map((s) => ({ slug: s.slug, order: s.order }))).toEqual([
      { slug: "intel/list", order: 1 },
      { slug: "intel/create", order: 2 },
    ]);
  });
});
