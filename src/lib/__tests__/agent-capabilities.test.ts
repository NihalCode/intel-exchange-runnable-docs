import { describe, it, expect } from "vitest";
import { detectAgentMode } from "../agent/mode";
import { buildStepSpec } from "../agent/spec";
import { generateAppBlueprint } from "../agent/app-builder";
import type { AgentStepResult } from "../agent/types";
import type { EndpointPage } from "../types";

describe("detectAgentMode", () => {
  it("detects app builder queries", () => {
    expect(detectAgentMode("Build a phishing email analyzer website")).toBe("app");
    expect(detectAgentMode("import stix bundle")).toBe("workflow");
  });
});

describe("buildStepSpec", () => {
  const page: EndpointPage = {
    slug: "ping/ping",
    title: "Ping",
    kind: "endpoint",
    breadcrumb: ["Ping"],
    description: "Health check",
    method: "GET",
    path: "/ping/",
    request: { query: [{ name: "verbose", value: "false", isRequired: false }] },
    responses: [{ statusCode: 200, description: "OK", body: [{ name: "status", value: "ok" }] }],
  };

  it("includes auth and expected response", () => {
    const spec = buildStepSpec(
      page,
      { method: "GET", path: "/ping/", query: [], headers: [] },
      "https://tenant.example/ctixapi"
    );
    expect(spec.auth.queryParams).toContain("AccessID");
    expect(spec.endpoint).toContain("https://tenant.example/ctixapi/ping/");
    expect(spec.expectedResponse?.statusCode).toBe(200);
  });
});

describe("generateAppBlueprint", () => {
  it("generates client, routes, and readme", () => {
    const step = {
      order: 1,
      slug: "ping/ping",
      title: "Ping",
      method: "GET" as const,
      path: "/ping/",
      explanation: "test",
      docUrl: "/docs/ping/ping",
      warnings: [],
      params: {},
      code: "",
      request: { method: "GET" as const, path: "/ping/", query: [], headers: [] },
      meta: {},
      spec: buildStepSpec(
        {
          slug: "ping/ping",
          title: "Ping",
          kind: "endpoint",
          breadcrumb: [],
          description: "",
          method: "GET",
          path: "/ping/",
          request: {},
          responses: [],
        },
        { method: "GET", path: "/ping/", query: [], headers: [] },
        "https://tenant.example/ctixapi"
      ),
    } satisfies AgentStepResult;

    const app = generateAppBlueprint("build ping app", "Ping App", "desc", [step]);
    expect(app.files.some((f) => f.path === "lib/cyware/client.ts")).toBe(true);
    expect(app.files.some((f) => f.path.includes("api/cyware"))).toBe(true);
    expect(app.files.some((f) => f.path === "README.md")).toBe(true);
  });

  it("phishing app uses documented Quick Add Intel endpoint", () => {
    const app = generateAppBlueprint(
      "Build a phishing email analyzer",
      "Phishing Email Analyzer",
      "desc",
      []
    );
    const createRoute = app.files.find((f) => f.path === "app/api/cyware/create-intel/route.ts");
    expect(createRoute).toBeDefined();
    expect(createRoute?.code).toContain("conversion/quick-intel/create-stix/");
    expect(createRoute?.code).toContain('indicators: { [indicatorKey]: safeValue }');
    expect(createRoute?.code).not.toContain("/ingestion/quick-add-intel/");
  });
});
