import { describe, it, expect } from "vitest";
import { planFromRetrieval } from "../agent/planner";
import type { ScoredChunk } from "../agent/types";

function chunk(partial: Partial<ScoredChunk> & Pick<ScoredChunk, "slug" | "title" | "kind" | "text">): ScoredChunk {
  return {
    id: `${partial.slug}::${partial.kind}`,
    breadcrumb: [],
    score: partial.score ?? 0.5,
    lexicalScore: partial.lexicalScore ?? 0.5,
    semanticScore: 0,
    ...partial,
  };
}

describe("planFromRetrieval", () => {
  it("builds import intel workflow from pattern match", () => {
    const chunks: ScoredChunk[] = [
      chunk({
        slug: "import-intel/source-collections",
        title: "Get Source Collections",
        kind: "endpoint",
        method: "GET",
        path: "/source/collections/",
        text: "collections import=true",
        score: 0.8,
      }),
      chunk({
        slug: "import-intel/import-intel",
        title: "Import Intel",
        kind: "endpoint",
        method: "POST",
        path: "/conversion/import/intel/",
        text: "upload stix bundle",
        score: 0.9,
      }),
      chunk({
        slug: "threat-data/list-threat-data",
        title: "Get Threat Data List",
        kind: "endpoint",
        method: "GET",
        path: "/threat-data/list/",
        text: "list indicators",
        score: 0.7,
      }),
    ];

    const plan = planFromRetrieval("import a stix bundle and verify indicator", chunks, 0.8);
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(plan.steps.some((s) => s.slug.includes("import-intel"))).toBe(true);
    expect(plan.workflow.toLowerCase()).toContain("stix");
  });

  it("returns clarifying questions when no endpoints match", () => {
    const plan = planFromRetrieval("xyzzy unknown", [], 0);
    expect(plan.steps).toHaveLength(0);
    expect(plan.questions?.length).toBeGreaterThan(0);
  });
});
