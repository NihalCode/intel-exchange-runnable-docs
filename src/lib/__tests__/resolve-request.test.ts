import { describe, it, expect } from "vitest";
import {
  applyPathParams,
  credFieldsForRequest,
  needsCredential,
  resolveStructured,
  resolveExec,
  previewRequest,
  unresolvedPathParams,
} from "../resolve-request";
import type { RunnableRequest } from "../types";
import { DISPLAY_BASE } from "../constants";

const SAMPLE_REQUEST: RunnableRequest = {
  method: "GET",
  path: "/v3/intel/",
  query: [
    { name: "page", value: "1" },
    { name: "page_size", value: "10" },
    { name: "AccessID", value: "<your access id>" },
    { name: "Signature", value: "<generated signature>" },
    { name: "Expires", value: "<unix expiry>" },
  ],
  headers: [],
};

const POST_REQUEST: RunnableRequest = {
  method: "POST",
  path: "/v3/intel/create/",
  query: [
    { name: "AccessID", value: "<your access id>" },
    { name: "Signature", value: "<generated signature>" },
    { name: "Expires", value: "<unix expiry>" },
  ],
  headers: [{ name: "Content-Type", value: "application/json" }],
  body: '{"title":"test"}',
};

describe("needsCredential", () => {
  it("flags AccessID placeholder", () => {
    expect(needsCredential("AccessID", "<your access id>")).toBe(true);
  });
  it("flags Signature placeholder", () => {
    expect(needsCredential("Signature", "<generated signature>")).toBe(true);
  });
  it("does NOT flag regular query param with a real value", () => {
    expect(needsCredential("page", "1")).toBe(false);
  });
  it("does NOT flag page_size", () => {
    expect(needsCredential("page_size", "10")).toBe(false);
  });
});

describe("credFieldsForRequest", () => {
  it("returns credential fields for placeholder values", () => {
    const fields = credFieldsForRequest(SAMPLE_REQUEST);
    const names = fields.map((f) => f.name);
    expect(names).toContain("AccessID");
    expect(names).toContain("Signature");
    expect(names).toContain("Expires");
  });

  it("does NOT include non-credential params", () => {
    const fields = credFieldsForRequest(SAMPLE_REQUEST);
    const names = fields.map((f) => f.name);
    expect(names).not.toContain("page");
    expect(names).not.toContain("page_size");
  });

  it("deduplicates fields with same name", () => {
    const fields = credFieldsForRequest(SAMPLE_REQUEST);
    const names = fields.map((f) => f.name.toLowerCase());
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe("applyPathParams", () => {
  it("substitutes {name} segments with example values", () => {
    const out = applyPathParams(
      "/ingestion/configuration/custom-attribute/{custom_attribute_id}/",
      [{ name: "custom_attribute_id", value: "abc-123" }]
    );
    expect(out).toBe("/ingestion/configuration/custom-attribute/abc-123/");
    expect(unresolvedPathParams(out)).toHaveLength(0);
  });

  it("prefers user overrides over defaults", () => {
    const out = applyPathParams(
      "/rules/{rule_id}/",
      [{ name: "rule_id", value: "old-id" }],
      { rule_id: "new-id" }
    );
    expect(out).toContain("new-id");
    expect(out).not.toContain("old-id");
  });
});

describe("resolveStructured — URL construction", () => {
  const getCred = (name: string) => {
    const map: Record<string, string> = {
      accessid: "MYACCESSID",
      signature: "MYSIG",
      expires: "9999",
    };
    return map[name.toLowerCase()] ?? "";
  };

  it("substitutes path parameters into the URL", () => {
    const req: RunnableRequest = {
      method: "GET",
      path: "/ingestion/configuration/custom-attribute/{custom_attribute_id}/",
      pathParams: [{ name: "custom_attribute_id", value: "f8ac8849-097c-446f-abe6-449fa1d6b89c" }],
      query: [
        { name: "AccessID", value: "<your access id>" },
        { name: "Signature", value: "<generated signature>" },
        { name: "Expires", value: "<unix expiry>" },
      ],
      headers: [],
    };
    const exec = resolveStructured(req, "https://tenant.com/ctixapi", getCred);
    expect(exec.url).toContain("/custom-attribute/f8ac8849-097c-446f-abe6-449fa1d6b89c/");
    expect(exec.url).not.toContain("{custom_attribute_id}");
  });

  it("joins base URL and path correctly", () => {
    const exec = resolveStructured(SAMPLE_REQUEST, "https://tenant.com/ctixapi", getCred);
    expect(exec.url).toContain("https://tenant.com/ctixapi/v3/intel/");
  });

  it("does not double /csap or /cftrapi when path already includes the product prefix", () => {
    const csap = resolveStructured(
      {
        method: "GET",
        path: "/csap/v1/test_connectivity/",
        query: [
          { name: "AccessID", value: "<your access id>" },
          { name: "Signature", value: "<generated signature>" },
          { name: "Expires", value: "<unix expiry>" },
        ],
        headers: [],
      },
      "https://tenant.cyware.com/csap",
      getCred
    );
    expect(csap.url).toMatch(/^https:\/\/tenant\.cyware\.com\/csap\/v1\/test_connectivity\/\?/);
    expect(csap.url).not.toContain("/csap/csap/");

    const cftr = resolveStructured(
      {
        method: "GET",
        path: "/cftrapi/openapi/test-connectivity/",
        query: [
          { name: "AccessID", value: "<your access id>" },
          { name: "Signature", value: "<generated signature>" },
          { name: "Expires", value: "<unix expiry>" },
        ],
        headers: [],
      },
      "https://tenant.cyware.com/cftrapi",
      getCred
    );
    expect(cftr.url).toMatch(
      /^https:\/\/tenant\.cyware\.com\/cftrapi\/openapi\/test-connectivity\/\?/
    );
    expect(cftr.url).not.toContain("/cftrapi/cftrapi/");
  });

  it("appends non-credential query params to URL", () => {
    const exec = resolveStructured(SAMPLE_REQUEST, "https://tenant.com/ctixapi", getCred);
    expect(exec.url).toContain("page=1");
    expect(exec.url).toContain("page_size=10");
  });

  it("substitutes credential values from getCred", () => {
    const exec = resolveStructured(SAMPLE_REQUEST, "https://tenant.com/ctixapi", getCred);
    expect(exec.url).toContain("AccessID=MYACCESSID");
    expect(exec.url).toContain("Signature=MYSIG");
    expect(exec.url).toContain("Expires=9999");
  });

  it("does NOT include raw placeholder strings in URL", () => {
    const exec = resolveStructured(SAMPLE_REQUEST, "https://tenant.com/ctixapi", getCred);
    expect(exec.url).not.toContain("<your access id>");
    expect(exec.url).not.toContain("<generated signature>");
  });

  it("drops empty optional query params (avoids int('') 400)", () => {
    const reqWithEmpty: RunnableRequest = {
      method: "GET",
      path: "/conversion/feed-sources/collection/",
      query: [
        { name: "source", value: "" },
        { name: "category", value: "" },
        { name: "page", value: "" },
        { name: "page_size", value: "" },
        { name: "sort", value: "" },
        { name: "AccessID", value: "<your access id>" },
        { name: "Signature", value: "<generated signature>" },
        { name: "Expires", value: "<unix expiry>" },
      ],
      headers: [],
    };
    const exec = resolveStructured(reqWithEmpty, "https://tenant.com/ctixapi", getCred);
    expect(exec.url).not.toContain("source=");
    expect(exec.url).not.toContain("page=");
    expect(exec.url).not.toContain("page_size=");
    expect(exec.url).not.toContain("sort=");
    expect(exec.url).toContain("AccessID=MYACCESSID");
    expect(exec.url).toContain("Expires=9999");
  });

  it("keeps optional params when a value is supplied via overrides", () => {
    const reqWithEmpty: RunnableRequest = {
      method: "GET",
      path: "/conversion/feed-sources/collection/",
      query: [
        { name: "page", value: "" },
        { name: "AccessID", value: "<your access id>" },
        { name: "Signature", value: "<generated signature>" },
        { name: "Expires", value: "<unix expiry>" },
      ],
      headers: [],
    };
    const exec = resolveStructured(
      reqWithEmpty,
      "https://tenant.com/ctixapi",
      getCred,
      undefined,
      { page: "3" }
    );
    expect(exec.url).toContain("page=3");
  });

  it("applies query overrides for non-credential params", () => {
    const exec = resolveStructured(
      SAMPLE_REQUEST,
      "https://tenant.com/ctixapi",
      getCred,
      undefined,
      { page: "5", page_size: "50" }
    );
    expect(exec.url).toContain("page=5");
    expect(exec.url).toContain("page_size=50");
  });

  it("credential values from getCred are NOT overridden by queryOverrides", () => {
    // queryOverrides should not affect credential params (they go through applyCreds)
    const exec = resolveStructured(
      SAMPLE_REQUEST,
      "https://tenant.com/ctixapi",
      getCred,
      undefined,
      { page: "2" }
    );
    expect(exec.url).toContain("AccessID=MYACCESSID");
    expect(exec.url).toContain("page=2");
  });

  it("passes bodyOverride when provided", () => {
    const override = '{"custom":"body"}';
    const exec = resolveStructured(POST_REQUEST, "https://tenant.com/ctixapi", getCred, override);
    expect(exec.body).toBe(override);
  });

  it("falls back to request body when no override", () => {
    const exec = resolveStructured(POST_REQUEST, "https://tenant.com/ctixapi", getCred, undefined);
    expect(exec.body).toBe(POST_REQUEST.body);
  });
});

describe("resolveExec — URL substitution", () => {
  const getCred = () => "";

  it("replaces DISPLAY_BASE with the provided baseUrl", () => {
    const exec = resolveExec(
      {
        method: "GET",
        url: `${DISPLAY_BASE}/v3/intel/?page=1`,
        headers: [],
      },
      "https://tenant.com/ctixapi",
      getCred
    );
    expect(exec.url).toContain("https://tenant.com/ctixapi");
    expect(exec.url).not.toContain(new URL(DISPLAY_BASE).hostname);
  });
});

describe("previewRequest", () => {
  it("includes method and URL", () => {
    const preview = previewRequest({
      method: "GET",
      url: "https://example.com/api",
      headers: [],
    });
    expect(preview).toContain("GET");
    expect(preview).toContain("https://example.com/api");
  });

  it("includes headers", () => {
    const preview = previewRequest({
      method: "POST",
      url: "https://example.com/api",
      headers: [{ name: "Content-Type", value: "application/json" }],
    });
    expect(preview).toContain("Content-Type: application/json");
  });

  it("includes body", () => {
    const preview = previewRequest({
      method: "POST",
      url: "https://example.com/api",
      headers: [],
      body: '{"key":"value"}',
    });
    expect(preview).toContain('{"key":"value"}');
  });
});

describe("URL encoding in query string", () => {
  it("encodes special characters in query values", () => {
    const req: RunnableRequest = {
      method: "GET",
      path: "/search/",
      query: [{ name: "q", value: "hello world&more" }],
      headers: [],
    };
    const exec = resolveStructured(req, "https://example.com", () => "");
    expect(exec.url).toContain("q=hello%20world%26more");
  });
});
