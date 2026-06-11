import { describe, it, expect } from "vitest";
import { buildWorkflowScripts, inferScriptPlan } from "../agent/script-builder";
import type { AgentStepResult } from "../agent/types";
import type { HttpMethod, KeyValue } from "../types";

const AUTH: KeyValue[] = [
  { name: "AccessID", value: "<your access id>" },
  { name: "Signature", value: "<generated signature>" },
  { name: "Expires", value: "<unix expiry>" },
];

function step(
  order: number,
  slug: string,
  title: string,
  method: HttpMethod,
  path: string,
  opts: { query?: KeyValue[]; body?: string; pathParams?: KeyValue[] } = {}
): AgentStepResult {
  return {
    order,
    slug,
    title,
    method,
    path,
    explanation: "",
    docUrl: `/docs/${slug}`,
    warnings: [],
    params: {},
    code: "",
    meta: {},
    spec: {},
    request: {
      method,
      path,
      pathParams: opts.pathParams ?? [],
      query: [...(opts.query ?? []), ...AUTH],
      headers: [],
      body: opts.body,
    },
  } as unknown as AgentStepResult;
}

const tagWorkflow = (): AgentStepResult[] => [
  step(1, "tags/list-tags", "Get Tags List", "GET", "ingestion/tags/", {
    query: [{ name: "page_size", value: "100" }],
  }),
  step(2, "tags/create-tag", "Create Tag", "POST", "ingestion/tags/", {
    body: JSON.stringify({ name: "SuperMalware", colour_code: "#0068FA" }),
  }),
  step(
    3,
    "threat-data/bulk-actions/bulk-add-remove-tags/bulk-add-remove-tags",
    "Bulk Add Tags",
    "POST",
    "ingestion/threat-data/bulk-action/add_tag/",
    {
      body: JSON.stringify({
        object_type: "indicator",
        object_ids: ["49d5e95e-3889-42de-8280-1ebf5c7cb95a"],
        data: { tag_id: ["ac542ff0-b423-4329-8c82-12e419e48e18"] },
      }),
    }
  ),
];

describe("inferScriptPlan", () => {
  it("collapses adjacent list + create on the same collection into find-or-create", () => {
    const plan = inferScriptPlan(tagWorkflow());
    expect(plan.ops).toHaveLength(2);
    expect(plan.ops[0].type).toBe("findOrCreate");
    if (plan.ops[0].type === "findOrCreate") {
      expect(plan.ops[0].captureName).toBe("tag_id");
      expect(plan.ops[0].matchValue).toBe("SuperMalware");
      expect(plan.ops[0].matchField).toBe("name");
    }
    expect(plan.ops[1].type).toBe("call");
  });

  it("wires the captured tag id into a later consumer's tag_id field", () => {
    const plan = inferScriptPlan(tagWorkflow());
    const consumer = plan.ops[1];
    expect(consumer.type).toBe("call");
    if (consumer.type === "call") {
      const body = consumer.step.body as { data: { tag_id: unknown } };
      expect(body.data.tag_id).toEqual(["{{tag_id}}"]);
    }
    expect(plan.notes.some((n) => n.includes("tag_id"))).toBe(true);
  });

  it("captures result ids for a standalone list/search step", () => {
    const plan = inferScriptPlan([
      step(1, "indicators/list-indicators", "Get Indicators List", "GET", "ingestion/indicators/"),
    ]);
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0].type).toBe("call");
    if (plan.ops[0].type === "call") {
      expect(plan.ops[0].captureListIds).toBe("indicator_ids");
    }
  });

  it("flags unresolved path parameters", () => {
    const plan = inferScriptPlan([
      step(1, "x/get", "Get Thing", "GET", "ingestion/things/{thing_id}/"),
    ]);
    expect(plan.notes.some((n) => n.includes("thing_id"))).toBe(true);
  });
});

describe("buildWorkflowScripts", () => {
  it("returns python and javascript by default", () => {
    const scripts = buildWorkflowScripts(tagWorkflow(), "https://example.com/ctixapi", "Tag flow");
    expect(scripts.map((s) => s.language).sort()).toEqual(["javascript", "python"]);
  });

  it("emits a self-contained python script with auth, retries, chaining and find-or-create", () => {
    const [py] = buildWorkflowScripts(tagWorkflow(), "https://example.com/ctixapi", "Tag flow", [
      "python",
    ]);
    expect(py.filename).toBe("workflow.py");
    expect(py.code).toContain("hmac.new");
    expect(py.code).toContain("def request(");
    expect(py.code).toContain("MAX_RETRIES");
    expect(py.code).toContain("e.code == 429");
    expect(py.code).toContain("Retry-After");
    expect(py.code).toContain("def resolve(");
    expect(py.code).toContain("find_in(");
    expect(py.code).toContain('ctx["tag_id"]');
    expect(py.code).toContain("{{tag_id}}");
  });

  it("emits a self-contained node script with auth, retries and chaining", () => {
    const [js] = buildWorkflowScripts(tagWorkflow(), "https://example.com/ctixapi", "Tag flow", [
      "javascript",
    ]);
    expect(js.filename).toBe("workflow.js");
    expect(js.code).toContain("crypto.createHmac");
    expect(js.code).toContain("async function request(");
    expect(js.code).toContain("res.status === 429");
    expect(js.code).toContain("retry-after");
    expect(js.code).toContain("function resolve(");
    expect(js.code).toContain("findIn(");
    expect(js.code).toContain('ctx["tag_id"]');
    expect(js.code).toContain("{{tag_id}}");
  });

  it("returns nothing for an empty plan", () => {
    expect(buildWorkflowScripts([], "https://example.com", "x")).toEqual([]);
  });
});
