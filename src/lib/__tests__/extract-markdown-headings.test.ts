import { describe, expect, it } from "vitest";
import { extractMarkdownHeadings } from "@/lib/extract-markdown-headings";

describe("extractMarkdownHeadings", () => {
  it("extracts level-2 and level-3 headings with slug ids", () => {
    const markdown = `# Title\n\n## Overview\n\nText\n\n### Query params\n\nMore`;
    expect(extractMarkdownHeadings(markdown)).toEqual([
      { id: "overview", text: "Overview", level: 2 },
      { id: "query-params", text: "Query params", level: 3 },
    ]);
  });

  it("ignores level-1 and level-4+ headings", () => {
    const markdown = "# H1\n#### H4\n## Keep me";
    expect(extractMarkdownHeadings(markdown)).toEqual([
      { id: "keep-me", text: "Keep me", level: 2 },
    ]);
  });
});
