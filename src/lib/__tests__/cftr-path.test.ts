import { describe, expect, it } from "vitest";
import { isCftrTenantBaseUrl, normalizeCftrApiPath } from "../cftr-path";
import { CFTR_DISPLAY_BASE } from "../constants";
import { buildRunnableRequest } from "../snippets";
import type { EndpointPage } from "../types";

describe("isCftrTenantBaseUrl", () => {
  it("treats cftrapi.cyware.com as non-tenant base", () => {
    expect(isCftrTenantBaseUrl("https://cftrapi.cyware.com")).toBe(false);
  });

  it("treats tenant /cftrapi paths as tenant base", () => {
    expect(isCftrTenantBaseUrl("https://cs-testv2.cyware.com/cftrapi")).toBe(true);
  });
});

describe("normalizeCftrApiPath", () => {
  it("keeps Postman paths for cftrapi.cyware.com base", () => {
    expect(
      normalizeCftrApiPath("/cftrapi/openapi/test-connectivity/", CFTR_DISPLAY_BASE)
    ).toBe("/cftrapi/openapi/test-connectivity/");
  });

  it("maps bare test-connectivity for cftrapi.cyware.com base", () => {
    expect(normalizeCftrApiPath("/test-connectivity/", CFTR_DISPLAY_BASE)).toBe(
      "/cftrapi/openapi/test-connectivity/"
    );
  });

  it("prefixes /v1 routes with /cftrapi/openapi on cftrapi.cyware.com base", () => {
    expect(normalizeCftrApiPath("/v1/action/", CFTR_DISPLAY_BASE)).toBe(
      "/cftrapi/openapi/v1/action/"
    );
  });

  it("strips /cftrapi prefix for tenant bases ending in /cftrapi", () => {
    expect(
      normalizeCftrApiPath(
        "/cftrapi/openapi/test-connectivity/",
        "https://cs-testv2.cyware.com/cftrapi"
      )
    ).toBe("/openapi/test-connectivity/");
  });

  it("prefixes /v1 routes with /openapi on tenant bases", () => {
    expect(
      normalizeCftrApiPath("/v1/incident/", "https://cs-testv2.cyware.com/cftrapi")
    ).toBe("/openapi/v1/incident/");
  });
});

describe("buildRunnableRequest CFTR", () => {
  const sample: EndpointPage = {
    slug: "cftr-api-reference/authentication/test-connectivity",
    title: "Test connectivity",
    kind: "endpoint",
    breadcrumb: [],
    description: "Test connectivity",
    method: "GET",
    path: "/cftrapi/openapi/test-connectivity/",
    request: { query: [], header: [], body: [], path: [] },
    responses: [],
  };

  it("keeps path for cftrapi.cyware.com default base", () => {
    const req = buildRunnableRequest(sample, "cftr");
    expect(req.path).toBe("/cftrapi/openapi/test-connectivity/");
  });

  it("normalizes legacy Postman template paths", () => {
    const page: EndpointPage = {
      ...sample,
      path: "{{base_url}}/test-connectivity/?AccessID={{open_api_access_id}}&Expires={{expires}}&Signature={{signature}}",
    };
    const req = buildRunnableRequest(page, "cftr");
    expect(req.path).toBe("/cftrapi/openapi/test-connectivity/");
  });
});
