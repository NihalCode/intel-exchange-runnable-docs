import { describe, expect, it } from "vitest";
import { normalizeCsapApiPath } from "../csap-path";
import { buildRunnableRequest } from "../snippets";
import type { EndpointPage } from "../types";

describe("normalizeCsapApiPath", () => {
  it("prefixes v1 paths with csap/", () => {
    expect(normalizeCsapApiPath("v1/test_connectivity/")).toBe("csap/v1/test_connectivity/");
  });

  it("leaves csap-prefixed paths unchanged", () => {
    expect(normalizeCsapApiPath("csap/v1/list_alert/")).toBe("csap/v1/list_alert/");
  });
});

describe("buildRunnableRequest CSAP paths", () => {
  const page: EndpointPage = {
    slug: "analyst-portal/authentication/test-connectivity",
    title: "Test Connectivity",
    kind: "endpoint",
    breadcrumb: [],
    description: "Test connectivity",
    method: "GET",
    path: "v1/test_connectivity/",
    request: { query: [], body: [], header: [], path: [] },
    responses: [],
  };

  it("normalizes legacy v1 paths to csap/v1 for CSAP product", () => {
    const req = buildRunnableRequest(page, "csap");
    expect(req.path).toBe("/csap/v1/test_connectivity/");
  });
});
