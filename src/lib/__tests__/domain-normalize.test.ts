import { describe, expect, it } from "vitest";

import { normalizeHostname } from "@/lib/domains/normalize";

describe("normalizeHostname", () => {
  it("lowercases and strips trailing dot", () => {
    const result = normalizeHostname("Docs.Example.COM.");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hostname).toBe("docs.example.com");
  });

  it("rejects scheme and path", () => {
    expect(normalizeHostname("https://evil.com/path").ok).toBe(false);
    expect(normalizeHostname("evil.com/admin").ok).toBe(false);
  });
});
