import { describe, it, expect } from "vitest";
import {
  injectOpenApiAuthIntoUrl,
  substituteSnippetPlaceholders,
} from "../credential-placeholders";

describe("substituteSnippetPlaceholders", () => {
  const getCred = (name: string) =>
    ({
      accessid: "aid-123",
      signature: "sig-abc",
      expires: "1700000020",
    })[name.toLowerCase()] ?? "";

  it("replaces unix expiry placeholder in Python params", () => {
    const code = `params = {"Expires": "<unix expiry>"}`;
    const out = substituteSnippetPlaceholders(code, getCred);
    expect(out).toContain('"Expires": "1700000020"');
    expect(out).not.toContain("<unix expiry>");
  });

  it("replaces access id and signature placeholders", () => {
    const code = `"AccessID": "<your access id>", "Signature": "<generated signature>"`;
    const out = substituteSnippetPlaceholders(code, getCred);
    expect(out).toContain("aid-123");
    expect(out).toContain("sig-abc");
  });

  it("replaces URL-encoded placeholders in JS fetch URLs", () => {
    const code =
      'const url = "https://t/ctixapi/ping/?AccessID=%3Cyour%20access%20id%3E&Signature=%3Cgenerated%20signature%3E&Expires=%3Cunix%20expiry%3E"';
    const out = substituteSnippetPlaceholders(code, getCred);
    expect(out).toContain(encodeURIComponent("aid-123"));
    expect(out).toContain(encodeURIComponent("sig-abc"));
    expect(out).toContain("1700000020");
    expect(out).not.toContain("%3Cunix%20expiry%3E");
  });
});

describe("injectOpenApiAuthIntoUrl", () => {
  const getCred = (name: string) =>
    ({
      AccessID: "aid-123",
      Signature: "sig-abc",
      Expires: "1700000020",
    })[name] ?? "";

  it("overwrites placeholder query params with real credentials", () => {
    const url =
      "https://cs-testv2.cyware.com/ctixapi/ping/?AccessID=%3Cyour%20access%20id%3E&Signature=%3Cgenerated%20signature%3E";
    const out = injectOpenApiAuthIntoUrl(url, getCred);
    const u = new URL(out);
    expect(u.searchParams.get("AccessID")).toBe("aid-123");
    expect(u.searchParams.get("Signature")).toBe("sig-abc");
    expect(u.searchParams.get("Expires")).toBe("1700000020");
  });
});
