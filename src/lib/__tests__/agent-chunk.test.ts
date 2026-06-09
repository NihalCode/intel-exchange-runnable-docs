import { describe, it, expect } from "vitest";
import { chunkEndpoint, chunkSection } from "../agent/chunk";
import type { EndpointPage, SectionPage } from "../types";

const ENDPOINT: EndpointPage = {
  slug: "ping/ping",
  title: "Ping",
  kind: "endpoint",
  breadcrumb: ["Ping"],
  description: "Health check for API connectivity.",
  method: "GET",
  path: "/ping/",
  request: {
    query: [{ name: "verbose", value: "false", valueType: "boolean", description: "Extra detail" }],
  },
  responses: [],
};

const SECTION: SectionPage = {
  slug: "threat-data",
  title: "Threat Data",
  kind: "section",
  breadcrumb: ["Threat Data"],
  markdown: "## Overview\nManage indicators and threat objects.",
};

describe("chunkEndpoint", () => {
  it("includes method, path, and param descriptions", () => {
    const chunk = chunkEndpoint(ENDPOINT);
    expect(chunk.id).toBe("ping/ping::endpoint");
    expect(chunk.kind).toBe("endpoint");
    expect(chunk.text).toContain("GET /ping/");
    expect(chunk.text).toContain("verbose");
    expect(chunk.text).toContain("Query parameters");
  });
});

describe("chunkSection", () => {
  it("includes title and markdown excerpt", () => {
    const chunk = chunkSection(SECTION);
    expect(chunk.kind).toBe("section");
    expect(chunk.text).toContain("Threat Data");
    expect(chunk.text).toContain("Manage indicators");
  });
});
