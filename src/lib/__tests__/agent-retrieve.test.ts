import { describe, it, expect } from "vitest";
import { retrieveLexical, confidenceFromScores } from "../agent/retrieve";
import type { AgentIndex } from "../agent/types";

const FIXTURE: AgentIndex = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  chunkCount: 3,
  hasEmbeddings: false,
  chunks: [
    {
      id: "ping/ping::endpoint",
      slug: "ping/ping",
      title: "Ping",
      kind: "endpoint",
      method: "GET",
      path: "/ping/",
      breadcrumb: ["Ping"],
      text: "Ping GET /ping/ health check connectivity",
    },
    {
      id: "import-intel/import-intel::endpoint",
      slug: "import-intel/import-intel",
      title: "Import Intel",
      kind: "endpoint",
      method: "POST",
      path: "/conversion/import/intel/",
      breadcrumb: ["Import Intel"],
      text: "Import Intel STIX bundle upload file multipart collection_id",
    },
    {
      id: "threat-data::section",
      slug: "threat-data",
      title: "Threat Data",
      kind: "section",
      breadcrumb: ["Threat Data"],
      text: "Threat data indicators search list pagination",
    },
  ],
  lexical: {
    docCount: 3,
    avgDocLen: 8,
    df: {
      ping: 1,
      health: 1,
      check: 1,
      connectivity: 1,
      import: 1,
      intel: 1,
      stix: 1,
      bundle: 1,
      upload: 1,
      file: 1,
      multipart: 1,
      collection_id: 1,
      threat: 1,
      data: 1,
      indicators: 1,
      search: 1,
      list: 1,
      pagination: 1,
      get: 1,
    },
    docs: [
      { chunkId: "ping/ping::endpoint", length: 6, terms: { ping: 1, health: 1, check: 1, connectivity: 1, get: 1 } },
      {
        chunkId: "import-intel/import-intel::endpoint",
        length: 9,
        terms: { import: 1, intel: 1, stix: 1, bundle: 1, upload: 1, file: 1, multipart: 1, collection_id: 1, post: 1 },
      },
      {
        chunkId: "threat-data::section",
        length: 7,
        terms: { threat: 1, data: 1, indicators: 1, search: 1, list: 1, pagination: 1 },
      },
    ],
  },
};

describe("retrieveLexical", () => {
  it("ranks import intel for STIX upload queries", () => {
    const results = retrieveLexical("import stix bundle upload", FIXTURE, 3);
    expect(results[0]?.slug).toBe("import-intel/import-intel");
  });

  it("ranks ping for connectivity queries", () => {
    const results = retrieveLexical("test api connectivity health", FIXTURE, 3);
    expect(results[0]?.slug).toBe("ping/ping");
  });

  it("returns empty for blank query", () => {
    expect(retrieveLexical("   ", FIXTURE)).toEqual([]);
  });
});

describe("confidenceFromScores", () => {
  it("returns top normalized score capped at 1", () => {
    const scored = retrieveLexical("import stix", FIXTURE, 1);
    const conf = confidenceFromScores(scored);
    expect(conf).toBeGreaterThan(0);
    expect(conf).toBeLessThanOrEqual(1);
  });
});
