import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  captureStepOutput,
  extractTagNameFromQuery,
  loadWorkflowContext,
  resolveWorkflowBodyText,
  setWorkflowTagName,
  validateWorkflowTokens,
} from "../workflow-step-context";
import { applyScriptPlanToSteps } from "../agent/script-builder";
import type { AgentStepResult } from "../agent/types";

function mockSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal(
    "sessionStorage",
    {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    }
  );
}

describe("workflow-step-context", () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  it("extracts tag name from natural language query", () => {
    expect(extractTagNameFromQuery('find or create tag "SampleTag2"')).toBe("SampleTag2");
  });

  it("extracts a bare tag name after 'tag' or 'label'", () => {
    expect(extractTagNameFromQuery("add the tag SampleTag6 on all the indicator")).toBe(
      "SampleTag6"
    );
    expect(extractTagNameFromQuery("a label called SampleTag9")).toBe("SampleTag9");
  });

  it("captures threat data ids and resolves object_ids in bulk body", () => {
    const wf = "wf-1";
    captureStepOutput(
      wf,
      1,
      "threat-data/list-threat-data",
      "GET",
      { results: [{ id: "ind-1" }, { id: "ind-2" }] }
    );
    setWorkflowTagName(wf, "SampleTag2");
    captureStepOutput(wf, 3, "tags/create-tag", "POST", { id: "tag-1", name: "SampleTag2" });

    const resolved = resolveWorkflowBodyText(
      JSON.stringify({
        object_type: "indicator",
        object_ids: "{{threat_data_ids}}",
        data: { tag_id: ["{{tag_id}}"] },
      }),
      wf
    );
    const parsed = JSON.parse(resolved);
    expect(parsed.object_ids).toEqual(["ind-1", "ind-2"]);
    expect(parsed.data.tag_id).toEqual(["tag-1"]);
  });

  it("finds tag_id from list-tags when name matches _tagName", () => {
    const wf = "wf-2";
    setWorkflowTagName(wf, "SampleTag2");
    captureStepOutput(wf, 2, "tags/list-tags", "GET", {
      results: [{ id: "tag-abc", name: "SampleTag2" }],
    });
    expect(loadWorkflowContext(wf).tag_id).toBe("tag-abc");
  });

  it("reports missing tokens before run", () => {
    expect(
      validateWorkflowTokens('{"object_ids":"{{threat_data_ids}}"}', "wf-missing")
    ).toMatch(/Run earlier steps first/);
  });
});

describe("applyScriptPlanToSteps", () => {
  it("pre-fills bulk add body and action_type path param", () => {
    const steps = [
      {
        order: 1,
        slug: "threat-data/list-threat-data",
        title: "List",
        request: { method: "GET", path: "ingestion/threat-data/", query: [], headers: [] },
      },
      {
        order: 2,
        slug: "tags/list-tags",
        title: "Tags",
        request: { method: "GET", path: "ingestion/tags/", query: [], headers: [] },
      },
      {
        order: 3,
        slug: "tags/create-tag",
        title: "Create",
        request: { method: "POST", path: "ingestion/tags/", query: [], headers: [], body: "{}" },
      },
      {
        order: 4,
        slug: "threat-data/bulk-actions/bulk-add-remove-tags/bulk-add-remove-tags",
        title: "Bulk",
        request: {
          method: "POST",
          path: "ingestion/threat-data/bulk-action/{action_type}/",
          pathParams: [{ name: "action_type", value: "" }],
          query: [],
          headers: [],
          body: "{}",
        },
      },
    ] as unknown as AgentStepResult[];

    const wired = applyScriptPlanToSteps(steps, 'add tag "SampleTag2" to indicators');
    expect(wired[1].request.query?.find((q) => q.name === "q")?.value).toBe("SampleTag2");
    const bulk = wired[3];
    expect(bulk.request.pathParams?.find((p) => p.name === "action_type")?.value).toBe("add_tag");
    const body = JSON.parse(bulk.request.body ?? "{}");
    expect(body.object_type).toBe("indicator");
    expect(body.object_ids).toEqual("{{threat_data_ids}}");
    expect(body.data.tag_id).toEqual(["{{tag_id}}"]);
    expect(JSON.parse(wired[2].request.body ?? "{}").name).toBe("SampleTag2");
  });
});
