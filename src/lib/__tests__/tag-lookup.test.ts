import { describe, it, expect } from "vitest";
import {
  findTagByName,
  isDuplicateTagError,
  summarizeCreateTagResponse,
  summarizeTagLookup,
} from "../tag-lookup";

describe("tag-lookup", () => {
  const listBody = {
    results: [
      { id: "28e04785-ef9e-4933-8d37-daec0a0e8665", name: "SampleTag6", is_active: true },
      { id: "other", name: "OtherTag", is_active: true },
    ],
  };

  it("finds tag by name case-insensitively", () => {
    expect(findTagByName(listBody.results, "sampletag6")?.id).toBe(
      "28e04785-ef9e-4933-8d37-daec0a0e8665"
    );
  });

  it("summarizes existing tag with id", () => {
    const s = summarizeTagLookup(listBody, "SampleTag6");
    expect(s.found).toBe(true);
    expect(s.message).toMatch(/already exists/);
    expect(s.message).toContain("28e04785-ef9e-4933-8d37-daec0a0e8665");
  });

  it("summarizes missing tag", () => {
    const s = summarizeTagLookup(listBody, "MissingTag");
    expect(s.found).toBe(false);
    expect(s.message).toMatch(/not found/);
  });

  it("summarizes successful create", () => {
    const msg = summarizeCreateTagResponse(
      { id: "new-id", name: "SampleTag7", is_active: true },
      "SampleTag7",
      true
    );
    expect(msg).toMatch(/Created tag/);
    expect(msg).toContain("new-id");
  });

  it("detects duplicate create error", () => {
    expect(isDuplicateTagError({ name: ["Tag with this name already exists"] })).toBe(true);
    const msg = summarizeCreateTagResponse(
      { name: ["Tag with this name already exists"] },
      "SampleTag6",
      false
    );
    expect(msg).toMatch(/already exists/);
  });
});
