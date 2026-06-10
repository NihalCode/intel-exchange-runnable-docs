import { describe, it, expect } from "vitest";
import createRelationshipPage from "../../content/pages/detailed-submission__relationship__create-relationship-sdo.json";
import { buildStepSpec, coerceParamExample } from "../agent/spec";
import { buildRunnableRequest } from "../snippets";
import type { EndpointPage } from "../types";

describe("coerceParamExample", () => {
  it("trims strings", () => {
    expect(coerceParamExample("  hello  ")).toBe("hello");
  });

  it("stringifies booleans and numbers from Theneo exports", () => {
    expect(coerceParamExample(false)).toBe("false");
    expect(coerceParamExample(0)).toBe("0");
  });

  it("stringifies object values", () => {
    expect(coerceParamExample({ id: "x" })).toBe('{"id":"x"}');
  });
});

describe("buildStepSpec", () => {
  it("handles relationship SDO fields with boolean example values", () => {
    const page = createRelationshipPage as unknown as EndpointPage;
    const request = buildRunnableRequest(page);
    expect(() => buildStepSpec(page, request, "https://tenant.cyware.com/ctixapi")).not.toThrow();
    const spec = buildStepSpec(page, request, "https://tenant.cyware.com/ctixapi");
    const revoked = spec.bodyParameters.find((p) => p.name === "revoked");
    expect(revoked?.example).toBe("false");
  });
});
