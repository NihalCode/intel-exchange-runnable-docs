import { describe, it, expect } from "vitest";
import { fixMarkdownArtifacts, cleanProse } from "../../../scripts/transform.mjs";

describe("fixMarkdownArtifacts", () => {
  it("removes leaked script tail from overview prose", () => {
    const input =
      'See the guide.\n\n\\"}\'>\n\nSupported Intel Exchange Version: 3.6.2';
    expect(fixMarkdownArtifacts(input)).not.toContain("\"}'");
    expect(fixMarkdownArtifacts(input)).toContain("Supported Intel Exchange Version");
  });

  it("fixes techdocs links ending with ##)", () => {
    const input =
      "[Watchlist](https://techdocs.cyware.com/ctix/en/watchlist.html##).";
    const out = fixMarkdownArtifacts(input);
    expect(out).toContain("watchlist.html).");
    expect(out).not.toContain("html##");
  });

  it("fixes query-string techdocs links with ##)", () => {
    const input =
      "[Docs](https://techdocs.cyware.com/ctix/en/index-en.html?contextId=ctix_landing##)";
    const out = fixMarkdownArtifacts(input);
    expect(out).toContain("contextId=ctix_landing)");
    expect(out).not.toContain("landing##");
  });
});

describe("cleanProse integration", () => {
  it("applies artifact fixes after html stripping", () => {
    const out = cleanProse('Hello\\"}\'>\n\nMore text.');
    expect(out).not.toContain("\"}'");
  });
});
