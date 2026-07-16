import { describe, expect, it } from "vitest";

import {
  effectiveQueryKeyValues,
  queryStringForRequest,
  resolveStructured,
} from "@/lib/resolve-request";
import type { RunnableRequest } from "@/lib/types";

const baseRequest: RunnableRequest = {
  method: "GET",
  path: "/objects",
  query: [
    { name: "page", value: "1", source: "documented" },
    { name: "AccessID", value: "YOUR_ACCESS_ID", source: "auth" },
    { name: "Signature", value: "YOUR_SIGNATURE", source: "auth" },
    { name: "Expires", value: "YOUR_EXPIRES", source: "auth" },
  ],
  headers: [],
};

describe("snippet/runner query parity", () => {
  it("merges custom params consistently for snippets and resolveStructured", () => {
    const custom = [{ id: "c1", name: "filter", value: "active", enabled: true }];
    const snippetQs = queryStringForRequest(baseRequest, { page: "2" }, custom);
    const exec = resolveStructured(
      baseRequest,
      "https://tenant.example.com/ctixapi",
      () => "",
      undefined,
      { page: "2" },
      undefined,
      undefined,
      custom
    );
    expect(exec.url).toContain("page=2");
    expect(exec.url).toContain("filter=active");
    expect(snippetQs).toContain("page=2");
    expect(snippetQs).toContain("filter=active");
    expect(effectiveQueryKeyValues(baseRequest, { page: "2" }, custom).map((p) => p.name)).toContain(
      "filter"
    );
  });

  it("rejects auth param override via custom merge", () => {
    expect(() =>
      effectiveQueryKeyValues(baseRequest, undefined, [
        { id: "bad", name: "AccessID", value: "evil", enabled: true },
      ])
    ).toThrow(/Reserved/);
  });
});
