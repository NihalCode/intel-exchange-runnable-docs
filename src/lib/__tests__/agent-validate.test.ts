import { describe, it, expect } from "vitest";
import { unsupportedEndpointAbstention, validateStep } from "../agent/validate";
import type { EndpointPage } from "../types";

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
