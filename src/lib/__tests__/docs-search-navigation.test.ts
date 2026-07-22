import { describe, expect, it } from "vitest";
import { docsSearchResultHref } from "@/lib/docs-search-href";

describe("docsSearchResultHref", () => {
  it("builds product-prefixed href for CTIX multi-segment slugs", () => {
    expect(
      docsSearchResultHref({ productId: "ctix", slug: "tags/list-tags", title: "Get Tags List" })
    ).toBe("/docs/ctix/tags/list-tags");
  });

  it("uses legacy CTIX path for single-segment slugs", () => {
    expect(
      docsSearchResultHref({ productId: "ctix", slug: "intel-exchange-api-reference", title: "Overview" })
    ).toBe("/docs/intel-exchange-api-reference");
  });

  it("builds CSAP product routes", () => {
    expect(
      docsSearchResultHref({
        productId: "csap",
        slug: "member-portal/member-portal-alerts/get-tags",
        title: "Get Tags",
      })
    ).toBe("/docs/csap/member-portal/member-portal-alerts/get-tags");
  });

  it("prefers explicit href when provided", () => {
    expect(
      docsSearchResultHref({ href: "/docs/ctix/custom", title: "Custom", slug: "ignored" })
    ).toBe("/docs/ctix/custom");
  });
});
