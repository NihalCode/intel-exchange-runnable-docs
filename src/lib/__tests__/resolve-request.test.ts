import { describe, it, expect } from "vitest";
import {
  credFieldsForRequest,
  needsCredential,
  resolveStructured,
  resolveExec,
  previewRequest,
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

describe("resolveStructured — URL construction", () => {
  const getCred = (name: string) => {
    const map: Record<string, string> = {
      accessid: "MYACCESSID",
      signature: "MYSIG",
      expires: "9999",
    };
    return map[name.toLowerCase()] ?? "";
  };

  it("joins base URL and path correctly", () => {
    const exec = resolveStructured(SAMPLE_REQUEST, "https://tenant.com/ctixapi", getCred);
    expect(exec.url).toContain("https://tenant.com/ctixapi/v3/intel/");
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
    expect(exec.url).not.toContain("tenantname.com");
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
