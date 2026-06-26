import { describe, it, expect } from "vitest";
import { detectAgentMode, resolveAgentRun } from "../agent/mode";
import { buildStepSpec } from "../agent/spec";
import { generateAppBlueprint } from "../agent/app-builder";
import { validateAppFiles } from "../agent/validate-app";
import type { AgentStepResult } from "../agent/types";
import type { EndpointPage } from "../types";

describe("detectAgentMode", () => {
  it("detects app builder queries", () => {
    expect(detectAgentMode("Build a phishing email analyzer website")).toBe("app");
    expect(detectAgentMode("import stix bundle")).toBe("workflow");
  });

  it("respects explicit workflow mode even for app-like queries", () => {
    expect(detectAgentMode("Build a phishing email analyzer website", "workflow")).toBe(
      "workflow"
    );
  });
});

describe("resolveAgentRun", () => {
  const savedApp = {
    appId: "abc",
    title: "Phishing Email Analyzer",
    version: 1,
    files: [{ path: "app/page.tsx", code: "export default function Page() { return null; }" }],
  };

  it("plans workflow for doc questions even with a saved app", () => {
    const { mode, editExistingApp } = resolveAgentRun({
      query: "List threat data indicators with pagination",
      existingApp: savedApp,
    });
    expect(mode).toBe("workflow");
    expect(editExistingApp).toBe(false);
  });

  it("edits saved app when the user asks for changes", () => {
    const { mode, editExistingApp } = resolveAgentRun({
      query: "Add dark mode",
      existingApp: savedApp,
    });
    expect(mode).toBe("app");
    expect(editExistingApp).toBe(true);
  });

  it("builds a new app from natural language without mode tabs", () => {
    const { mode, editExistingApp } = resolveAgentRun({
      query: "Build a phishing analyzer",
    });
    expect(mode).toBe("app");
    expect(editExistingApp).toBe(false);
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

  it("generated phishing app passes full syntax validation", () => {
    const app = generateAppBlueprint(
      "Build a phishing email analyzer",
      "Phishing Email Analyzer",
      "desc",
      []
    );
    expect(validateAppFiles(app.files.map((f) => ({ path: f.path, code: f.code })))).toEqual([]);
  });

  it("phishing app supports file uploads for all intel file types", () => {
    const app = generateAppBlueprint(
      "Build a phishing email analyzer",
      "Phishing Email Analyzer",
      "desc",
      []
    );
    const page = app.files.find((f) => f.path === "app/page.tsx");
    expect(page?.code).toContain("extractTextFromFile");
    expect(page?.code).toContain("stixToText");
    // pdf, word, image OCR via CDN — no new package.json deps
    expect(page?.code).toContain("pdf.min.js");
    expect(page?.code).toContain("mammoth");
    expect(page?.code).toContain("tesseract");
    expect(page?.code).toContain(".stix2");
    expect(page?.code).toContain(".eml");
    expect(page?.code).toContain("handleFiles");
    const pkg = app.files.find((f) => f.path === "package.json");
    expect(pkg?.code).not.toContain("tesseract");
  });

  it("phishing search route fetches risk score with refresh-score fallback", () => {
    const app = generateAppBlueprint(
      "Build a phishing email analyzer",
      "Phishing Email Analyzer",
      "desc",
      []
    );
    const searchRoute = app.files.find((f) => f.path === "app/api/cyware/search/route.ts");
    const page = app.files.find((f) => f.path === "app/page.tsx");
    expect(searchRoute?.code).toContain("refresh-score");
    expect(searchRoute?.code).toContain("parseRiskScore");
    expect(page?.code).toContain("risk-score-bar");
  });
});
