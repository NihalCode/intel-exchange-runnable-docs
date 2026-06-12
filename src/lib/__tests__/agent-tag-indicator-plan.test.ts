import { describe, it, expect } from "vitest";
import {
  enforceTagIndicatorPlan,
  enforceTagManagementPlan,
  isTagListVerifyQuery,
  isTagToIndicatorQuery,
} from "../agent/planner";
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

describe("tag list/verify planning", () => {
  it("detects list/verify tag queries", () => {
    expect(
      isTagListVerifyQuery(
        "List tags with page_size 100 and confirm tag 'SampleTag5' exists. Show its id, name, and is_active from the results."
      )
    ).toBe(true);
    expect(isTagListVerifyQuery('Create a new user tag named "SampleTag5"')).toBe(false);
  });

  it("replaces wrong plan with Get Tags List for verify query", () => {
    const plan: AgentPlan = {
      workflow: "wrong",
      confidence: 0.9,
      steps: [
        {
          slug: "tag-groups/bulk-action/create-tag-group",
          order: 1,
          explanation: "wrong",
        },
      ],
      citations: [],
    };
    const chunks = [
      chunk("tags/list-tags", "Get Tags List"),
      chunk("tag-groups/bulk-action/create-tag-group", "Create Tag Group"),
    ];
    const query =
      "List tags with page_size 100 and confirm tag 'SampleTag5' exists. Show its id, name, and is_active from the results.";
    const fixed = enforceTagManagementPlan(plan, query, chunks);
    expect(fixed.steps).toHaveLength(1);
    expect(fixed.steps[0].slug).toBe("tags/list-tags");
    expect(fixed.steps.some((s) => /tag-groups|bulk-actions/.test(s.slug))).toBe(false);
    expect(fixed.workflow).toMatch(/SampleTag5/i);
  });
});
