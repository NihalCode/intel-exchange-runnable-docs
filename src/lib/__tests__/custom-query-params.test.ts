import { describe, expect, it } from "vitest";

import { mergeQueryParameters, QueryParamMergeError } from "@/lib/merge-query-params";

describe("mergeQueryParameters", () => {
  it("preserves documented order and appends custom params", () => {
    const merged = mergeQueryParameters({
      documented: [
        { name: "page", value: "1", source: "documented" },
        { name: "q", value: "test", source: "documented", required: true },
      ],
      custom: [{ id: "1", name: "filter", value: "open", enabled: true }],
      auth: [{ name: "AccessID", value: "id", source: "auth" }],
    });
    expect(merged.map((p) => p.name)).toEqual(["page", "q", "filter", "AccessID"]);
  });

  it("rejects auth override via custom param", () => {
    expect(() =>
      mergeQueryParameters({
        documented: [],
        custom: [{ id: "1", name: "Signature", value: "x", enabled: true }],
      })
    ).toThrow(QueryParamMergeError);
  });
});
