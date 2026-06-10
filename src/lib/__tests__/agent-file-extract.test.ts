import { describe, it, expect } from "vitest";
import {
  buildQueryWithAttachments,
  stixToText,
  MAX_CHARS_PER_FILE,
  AGENT_UPLOAD_ACCEPT,
} from "../agent/file-extract-client";

describe("stixToText", () => {
  it("extracts indicator patterns, values, and hashes from a STIX 2.x bundle", () => {
    const bundle = {
      type: "bundle",
      objects: [
        {
          type: "indicator",
          pattern: "[ipv4-addr:value = '198.51.100.42']",
          name: "C2 server",
        },
        {
          type: "file",
          hashes: { "SHA-256": "a".repeat(64), MD5: "b".repeat(32) },
        },
        { type: "url", value: "http://malware.example.com/payload" },
      ],
    };
    const out: string[] = [];
    stixToText(bundle, out);
    expect(out).toContain("[ipv4-addr:value = '198.51.100.42']");
    expect(out).toContain("C2 server");
    expect(out).toContain("a".repeat(64));
    expect(out).toContain("b".repeat(32));
    expect(out).toContain("http://malware.example.com/payload");
  });

  it("returns nothing for non-intel JSON", () => {
    const out: string[] = [];
    stixToText({ count: 3, ok: true }, out);
    expect(out).toEqual([]);
  });
});

describe("buildQueryWithAttachments", () => {
  it("returns input unchanged with no attachments", () => {
    expect(buildQueryWithAttachments("hello", [])).toBe("hello");
  });

  it("appends attachment blocks with filename headers", () => {
    const q = buildQueryWithAttachments("Analyze this email", [
      { name: "phish.eml", text: "From: attacker@evil.com", truncated: false },
    ]);
    expect(q).toContain("Analyze this email");
    expect(q).toContain("--- Attached file: phish.eml ---");
    expect(q).toContain("From: attacker@evil.com");
  });

  it("marks truncated attachments", () => {
    const q = buildQueryWithAttachments("x", [
      { name: "big.pdf", text: "...", truncated: true },
    ]);
    expect(q).toContain("big.pdf (truncated)");
  });
});

describe("upload config", () => {
  it("accepts all intel file types", () => {
    for (const ext of [".eml", ".msg", ".stix", ".stix2", ".json", ".pdf", ".docx", "image/*"]) {
      expect(AGENT_UPLOAD_ACCEPT).toContain(ext);
    }
  });

  it("caps per-file text to keep the agent payload bounded", () => {
    expect(MAX_CHARS_PER_FILE).toBeLessThanOrEqual(50_000);
  });
});
