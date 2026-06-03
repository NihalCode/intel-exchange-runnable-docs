import { describe, it, expect } from "vitest";
import {
  isMutating,
  isSensitiveName,
  looksLikePlaceholder,
  maskText,
  maskValue,
} from "../security";

describe("isMutating", () => {
  it("identifies POST as mutating", () => expect(isMutating("POST")).toBe(true));
  it("identifies PUT as mutating", () => expect(isMutating("PUT")).toBe(true));
  it("identifies PATCH as mutating", () => expect(isMutating("PATCH")).toBe(true));
  it("identifies DELETE as mutating", () => expect(isMutating("DELETE")).toBe(true));
  it("treats GET as non-mutating", () => expect(isMutating("GET")).toBe(false));
  it("treats HEAD as non-mutating", () => expect(isMutating("HEAD")).toBe(false));
  it("is case-insensitive", () => {
    expect(isMutating("post")).toBe(true);
    expect(isMutating("get")).toBe(false);
  });
});

describe("isSensitiveName", () => {
  it("matches Authorization", () => expect(isSensitiveName("Authorization")).toBe(true));
  it("matches api_key", () => expect(isSensitiveName("api_key")).toBe(true));
  it("matches Signature", () => expect(isSensitiveName("Signature")).toBe(true));
  it("matches AccessID", () => expect(isSensitiveName("AccessID")).toBe(true));
  it("matches password", () => expect(isSensitiveName("password")).toBe(true));
  it("does not match page", () => expect(isSensitiveName("page")).toBe(false));
  it("does not match sort", () => expect(isSensitiveName("sort")).toBe(false));
  it("does not match source", () => expect(isSensitiveName("source")).toBe(false));
});

describe("looksLikePlaceholder", () => {
  it("detects <angle bracket> placeholders", () => {
    expect(looksLikePlaceholder("<your access id>")).toBe(true);
    expect(looksLikePlaceholder("<generated signature>")).toBe(true);
  });
  it("detects {{mustache}} placeholders", () => {
    expect(looksLikePlaceholder("{{API_KEY}}")).toBe(true);
  });
  it("detects YOUR_xxx patterns", () => {
    expect(looksLikePlaceholder("YOUR_SECRET_KEY")).toBe(true);
  });
  it("does not flag real values", () => {
    expect(looksLikePlaceholder("abc123realvalue")).toBe(false);
    expect(looksLikePlaceholder("")).toBe(false);
  });
});

describe("maskValue", () => {
  it("masks a long value, keeping first 2 and last 2 chars", () => {
    const masked = maskValue("abcdefghij");
    expect(masked.startsWith("ab")).toBe(true);
    expect(masked.endsWith("ij")).toBe(true);
    expect(masked).toContain("•");
  });
  it("masks very short values entirely", () => {
    expect(maskValue("abc")).toBe("•••");
  });
});

describe("maskText", () => {
  it("masks Signature query param values in URLs", () => {
    const url = "GET https://example.com/api?AccessID=abc123&Signature=secretsig&Expires=9999";
    const masked = maskText(url, []);
    expect(masked).not.toContain("secretsig");
    expect(masked).not.toContain("abc123");
  });

  it("masks Authorization header values", () => {
    const header = "Authorization: Bearer mySuperSecretToken";
    const masked = maskText(header, []);
    expect(masked).not.toContain("mySuperSecretToken");
    expect(masked.toLowerCase()).toContain("authorization");
  });

  it("masks explicit secrets from extraSecrets list", () => {
    const text = "token=supersecret123 other=value";
    const masked = maskText(text, ["supersecret123"]);
    expect(masked).not.toContain("supersecret123");
  });

  it("leaves non-sensitive content unchanged", () => {
    const text = "page=1&page_size=20&sort=asc";
    const masked = maskText(text, []);
    expect(masked).toBe(text);
  });
});
