import { describe, it, expect } from "vitest";
import { trimChunkText, formatTrimmedContext } from "../agent/trim-context";
import type { ScoredChunk } from "../agent/types";

const CHUNK_TEXT = [
  "Get Tags List",
  "tags > list-tags",
  "GET ingestion/tags/",
  "Returns a list of tags from Intel Exchange.",
  [
    "Query parameters:",
    "- page (optional, string): Pass the page number to retrieve tags.",
    "- page_size (optional, string): Pass the number of records per page.",
    "- created_from (optional, integer): Filter by created epoch.",
    "- created_to (optional, integer): Filter by created epoch.",
    "- tag_type (optional, string): Filter tags by type.",
    "- q (optional, string): Search tags by name.",
  ].join("\n"),
].join("\n\n");

describe("trimChunkText", () => {
  it("keeps params mentioned in the query and drops unrelated optionals", () => {
    const trimmed = trimChunkText(CHUNK_TEXT, "search tags by q and page_size");
    expect(trimmed).toContain("- q (");
    expect(trimmed).toContain("- page_size (");
    // Unmentioned optional descriptions should be dropped or summarized.
    expect(trimmed).not.toContain("Filter by created epoch.");
    expect(trimmed).toMatch(/more optional param/);
  });

  it("keeps the signature and description", () => {
    const trimmed = trimChunkText(CHUNK_TEXT, "list tags");
    expect(trimmed).toContain("GET ingestion/tags/");
    expect(trimmed).toContain("Returns a list of tags");
  });

  it("produces a smaller string than the original", () => {
    const trimmed = trimChunkText(CHUNK_TEXT, "list tags");
    expect(trimmed.length).toBeLessThan(CHUNK_TEXT.length);
  });
});

describe("formatTrimmedContext", () => {
  it("includes slug headers and respects the limit", () => {
    const chunks: ScoredChunk[] = [
      {
        id: "tags/list-tags::endpoint",
        slug: "tags/list-tags",
        title: "Get Tags List",
        kind: "endpoint",
        method: "GET",
        path: "ingestion/tags/",
        breadcrumb: [],
        text: CHUNK_TEXT,
        score: 0.9,
        lexicalScore: 0,
        semanticScore: 0.9,
      },
    ];
    const ctx = formatTrimmedContext(chunks, "search tags by q", 8);
    expect(ctx).toContain("slug=tags/list-tags");
    expect(ctx).toContain("GET ingestion/tags/");
  });
});
