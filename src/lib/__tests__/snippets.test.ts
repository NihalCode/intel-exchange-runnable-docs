import { describe, it, expect } from "vitest";
import { DISPLAY_BASE } from "../constants";
import { buildEndpointSnippets, buildRunnableRequest } from "../snippets";
import type { EndpointPage } from "../types";

const PING_PAGE: EndpointPage = {
  slug: "ping__ping",
  title: "Ping",
  kind: "endpoint",
  breadcrumb: ["Ping"],
  description: "Health check endpoint.",
  method: "GET",
  path: "/ping/",
  request: {},
  responses: [],
};

const CREATE_PAGE: EndpointPage = {
  slug: "intel__create",
  title: "Create Intel",
  kind: "endpoint",
  breadcrumb: ["Intel", "Create"],
  description: "Create an intel object.",
  method: "POST",
  path: "/v3/intel/create/",
  request: {
    query: [
      { name: "page", value: "1", valueType: "integer" },
    ],
    body: [
      { name: "title", value: "Test", valueType: "string", isRequired: true },
      { name: "active", value: "true", valueType: "boolean" },
      { name: "count", value: "5", valueType: "integer" },
    ],
  },
  responses: [],
};

describe("buildRunnableRequest", () => {
  it("includes auth query params for all endpoints", () => {
    const req = buildRunnableRequest(PING_PAGE);
    const names = req.query.map((q) => q.name);
    expect(names).toContain("AccessID");
    expect(names).toContain("Signature");
    expect(names).toContain("Expires");
  });

  it("sets correct method", () => {
    expect(buildRunnableRequest(PING_PAGE).method).toBe("GET");
    expect(buildRunnableRequest(CREATE_PAGE).method).toBe("POST");
  });

  it("normalizes path to start with /", () => {
    const req = buildRunnableRequest(PING_PAGE);
    expect(req.path).toMatch(/^\//);
  });

  it("builds body from body params for POST", () => {
    const req = buildRunnableRequest(CREATE_PAGE);
    expect(req.body).toBeDefined();
    const parsed = JSON.parse(req.body!);
    expect(parsed.title).toBe("Test");
  });

  it("coerces boolean body field correctly", () => {
    const req = buildRunnableRequest(CREATE_PAGE);
    const parsed = JSON.parse(req.body!);
    expect(typeof parsed.active).toBe("boolean");
    expect(parsed.active).toBe(true);
  });

  it("coerces integer body field correctly", () => {
    const req = buildRunnableRequest(CREATE_PAGE);
    const parsed = JSON.parse(req.body!);
    expect(typeof parsed.count).toBe("number");
    expect(parsed.count).toBe(5);
  });

  it("does NOT produce a body for GET endpoints", () => {
    const req = buildRunnableRequest(PING_PAGE);
    expect(req.body).toBeUndefined();
  });

  it("includes query params from the endpoint definition", () => {
    const req = buildRunnableRequest(CREATE_PAGE);
    const names = req.query.map((q) => q.name);
    expect(names).toContain("page");
  });
});

describe("buildEndpointSnippets", () => {
  it("returns at least curl, JS, and Python snippets", () => {
    const snippets = buildEndpointSnippets(PING_PAGE);
    const labels = snippets.map((s) => s.label);
    expect(labels).toContain("cURL");
    expect(labels).toContain("JavaScript");
    expect(labels).toContain("Python");
  });

  it("cURL snippet has runKind=http", () => {
    const snippets = buildEndpointSnippets(PING_PAGE);
    const curl = snippets.find((s) => s.label === "cURL");
    expect(curl?.runKind).toBe("http");
    expect(curl?.request).toBeDefined();
  });

  it("cURL snippet uses DISPLAY_BASE (cs-testv2 tenant)", () => {
    const snippets = buildEndpointSnippets(PING_PAGE);
    const curl = snippets.find((s) => s.label === "cURL");
    expect(curl?.code).toContain(`${DISPLAY_BASE}/ping/`);
    expect(DISPLAY_BASE).toContain("cs-testv2.cyware.com");
  });

  it("JavaScript snippet has runKind=javascript", () => {
    const snippets = buildEndpointSnippets(PING_PAGE);
    const js = snippets.find((s) => s.label === "JavaScript");
    expect(js?.runKind).toBe("javascript");
  });

  it("Python snippet has runKind=python", () => {
    const snippets = buildEndpointSnippets(PING_PAGE);
    const py = snippets.find((s) => s.label === "Python");
    expect(py?.runKind).toBe("python");
  });

  it("JavaScript snippet uses response.text() not response.json() directly", () => {
    const snippets = buildEndpointSnippets(PING_PAGE);
    const js = snippets.find((s) => s.label === "JavaScript");
    expect(js?.code).toContain("response.text()");
    expect(js?.code).not.toContain("response.json()");
  });

  it("POST endpoint includes Request Body snippet", () => {
    const snippets = buildEndpointSnippets(CREATE_PAGE);
    const bodySnippet = snippets.find((s) => s.label === "Request Body");
    expect(bodySnippet).toBeDefined();
    expect(bodySnippet?.runKind).toBe("json");
  });

  it("GET endpoint without body does NOT include Request Body snippet", () => {
    const snippets = buildEndpointSnippets(PING_PAGE);
    const bodySnippet = snippets.find((s) => s.label === "Request Body");
    expect(bodySnippet).toBeUndefined();
  });

  it("cURL snippet contains the endpoint path", () => {
    const snippets = buildEndpointSnippets(PING_PAGE);
    const curl = snippets.find((s) => s.label === "cURL");
    expect(curl?.code).toContain("/ping/");
  });

  it("Python snippet contains the endpoint path", () => {
    const snippets = buildEndpointSnippets(PING_PAGE);
    const py = snippets.find((s) => s.label === "Python");
    expect(py?.code).toContain("/ping/");
  });

  it("substitutes path parameters in generated snippets", () => {
    const page: EndpointPage = {
      slug: "admin/custom/retrieve",
      title: "Get Custom Attribute",
      kind: "endpoint",
      breadcrumb: ["Admin"],
      description: "Retrieve one.",
      method: "GET",
      path: "ingestion/configuration/custom-attribute/{custom_attribute_id}/",
      request: {
        path: [
          {
            name: "custom_attribute_id",
            value: "f8ac8849-097c-446f-abe6-449fa1d6b89c",
            valueType: "string",
            isRequired: true,
          },
        ],
      },
      responses: [],
    };
    const snippets = buildEndpointSnippets(page);
    const curl = snippets.find((s) => s.label === "cURL");
    expect(curl?.code).toContain("f8ac8849-097c-446f-abe6-449fa1d6b89c");
    expect(curl?.code).not.toContain("{custom_attribute_id}");
    expect(curl?.request?.pathParams?.[0]?.name).toBe("custom_attribute_id");
  });

  it("omits empty optional query params from generated snippets", () => {
    const page: EndpointPage = {
      slug: "feed/collection",
      title: "Feed Sources",
      kind: "endpoint",
      breadcrumb: ["Feed"],
      description: "List feed sources.",
      method: "GET",
      path: "/conversion/feed-sources/collection/",
      request: {
        query: [
          { name: "source", value: "" },
          { name: "category", value: "" },
          { name: "page", value: "" },
          { name: "page_size", value: "" },
          { name: "sort", value: "" },
        ],
      },
      responses: [],
    };
    const snippets = buildEndpointSnippets(page);
    const curl = snippets.find((s) => s.label === "cURL");
    const js = snippets.find((s) => s.label === "JavaScript");
    const py = snippets.find((s) => s.label === "Python");

    for (const code of [curl?.code, js?.code]) {
      expect(code).not.toContain("source=");
      expect(code).not.toContain("page=&");
      expect(code).not.toContain("page_size=");
      expect(code).not.toContain("sort=");
    }
    // Python params dict should not list the empty optional keys
    expect(py?.code).not.toContain('"source"');
    expect(py?.code).not.toContain('"page_size"');
    // Auth params are still present
    expect(curl?.code).toContain("AccessID");
  });
});

describe("JSON payload validation helper", () => {
  // Test the inline validation logic used by PayloadEditor
  function validateJson(text: string): string | null {
    if (!text.trim()) return null;
    try {
      JSON.parse(text);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  }

  it("returns null for empty string", () => {
    expect(validateJson("")).toBeNull();
    expect(validateJson("   ")).toBeNull();
  });

  it("returns null for valid JSON object", () => {
    expect(validateJson('{"key":"value"}')).toBeNull();
  });

  it("returns null for valid JSON array", () => {
    expect(validateJson("[1,2,3]")).toBeNull();
  });

  it("returns an error message for invalid JSON", () => {
    expect(validateJson("{bad json}")).not.toBeNull();
    expect(validateJson("undefined")).not.toBeNull();
    expect(validateJson("{")).not.toBeNull();
  });
});
