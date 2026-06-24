import { describe, expect, it } from "vitest";
import { normalizePostmanEndpointPath } from "@/lib/postman-path";

describe("normalizePostmanEndpointPath", () => {
  it("normalizes CFTR test connectivity template", () => {
    const raw =
      "{{base_url}}/test-connectivity/?AccessID={{open_api_access_id}}&Expires={{expires}}&Signature={{signature}}";
    const { path, embeddedQuery, pathParamNames } = normalizePostmanEndpointPath(raw);
    expect(path).toBe("/test-connectivity/");
    expect(pathParamNames).toEqual([]);
    expect(embeddedQuery.map((q) => q.name).sort()).toEqual(["AccessID", "Expires", "Signature"]);
  });

  it("converts Postman :id path params", () => {
    const { path, pathParamNames } = normalizePostmanEndpointPath(
      "{{base_url}}v1/incident/:incident_unique_id/"
    );
    expect(path).toBe("/v1/incident/{incident_unique_id}/");
    expect(pathParamNames).toContain("incident_unique_id");
  });
});
