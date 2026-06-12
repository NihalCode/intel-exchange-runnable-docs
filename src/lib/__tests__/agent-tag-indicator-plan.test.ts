import { describe, it, expect } from "vitest";
import { enforceTagIndicatorPlan, isTagToIndicatorQuery } from "../agent/planner";
import type { AgentPlan, ScoredChunk } from "../agent/types";

const chunk = (slug: string, title: string): ScoredChunk => ({
  id: slug,
  slug,
  title,
  kind: "endpoint",
  method: "POST",
  path: "/",
  breadcrumb: [],
  text: title,
  score: 1,
  lexicalScore: 1,
  semanticScore: 0,
});

describe("tag-to-indicator planning", () => {
  it("detects tag-to-indicator queries", () => {
    expect(isTagToIndicatorQuery('Add tag "SampleTag2" to all indicators')).toBe(true);
    expect(isTagToIndicatorQuery("ping the api")).toBe(false);
  });

  it("replaces tag-group bulk action with bulk add tags workflow", () => {
    const plan: AgentPlan = {
      workflow: "wrong",
      confidence: 0.9,
      steps: [
        { slug: "tags/list-tags", order: 1, explanation: "a" },
        { slug: "tag-groups/bulk-action/enable-bulk-tag-group", order: 2, explanation: "wrong" },
      ],
      citations: [],
    };
    const chunks = [
      chunk("threat-data/list-threat-data", "List Threat Data"),
      chunk("tags/list-tags", "List Tags"),
      chunk("tags/create-tag", "Create Tag"),
      chunk(
        "threat-data/bulk-actions/bulk-add-remove-tags/bulk-add-remove-tags",
        "Bulk Add Tags"
      ),
    ];
    const fixed = enforceTagIndicatorPlan(
      plan,
      'bulk-add tag "SampleTag2" to indicators',
      chunks
    );
    expect(fixed.steps.some((s) => s.slug.includes("tag-groups"))).toBe(false);
    expect(
      fixed.steps.some(
        (s) => s.slug === "threat-data/bulk-actions/bulk-add-remove-tags/bulk-add-remove-tags"
      )
    ).toBe(true);
    expect(fixed.steps.some((s) => s.slug === "threat-data/list-threat-data")).toBe(true);
  });
});
