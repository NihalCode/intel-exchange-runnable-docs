import { describe, it, expect } from "vitest";
import { generateStepCode } from "../agent/codegen";
import type { EndpointPage } from "../types";

const PAGE: EndpointPage = {
  slug: "ping/ping",
  title: "Ping",
  kind: "endpoint",
  breadcrumb: ["Ping"],
  description: "Ping",
  method: "GET",
  path: "/ping/",
  request: {},
  responses: [],
};

describe("generateStepCode", () => {
  it("generates python with auth placeholders", () => {
    const { code, request } = generateStepCode(PAGE, undefined, "python", "https://tenant.example/ctixapi");
    expect(code).toContain("import requests");
    expect(code).toContain("https://tenant.example/ctixapi");
    expect(request.query.some((q) => q.name === "AccessID")).toBe(true);
  });

  it("generates curl runnable snippet", () => {
    const { code, request } = generateStepCode(PAGE, undefined, "curl", "https://tenant.example/ctixapi");
    expect(code).toContain("curl --request GET");
    expect(request.method).toBe("GET");
  });

  it("applies query overrides", () => {
    const PAGE_Q: EndpointPage = {
      ...PAGE,
      request: { query: [{ name: "page", value: "1" }] },
    };
    const { request } = generateStepCode(
      PAGE_Q,
      { query: { page: "3" } },
      "python",
      "https://tenant.example/ctixapi"
    );
    expect(request.query.find((q) => q.name === "page")?.value).toBe("3");
  });
});
