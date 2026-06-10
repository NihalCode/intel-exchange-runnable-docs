import { describe, it, expect } from "vitest";
import { applySearchReplace } from "../agent/app-edit-rules";

const FILE = `function hello() {
  const greeting = "hi";
  return greeting;
}

function other() {
  return 42;
}
`;

describe("applySearchReplace", () => {
  it("replaces an exact match", () => {
    const result = applySearchReplace(FILE, 'const greeting = "hi";', 'const greeting = "hello world";');
    expect(result).toContain('"hello world"');
    expect(result).not.toContain('"hi"');
  });

  it("replaces a multi-line exact match", () => {
    const search = `function other() {
  return 42;
}`;
    const replace = `function other() {
  return 43;
}`;
    const result = applySearchReplace(FILE, search, replace);
    expect(result).toContain("return 43;");
    expect(result).not.toContain("return 42;");
  });

  it("falls back to whitespace-tolerant matching", () => {
    // Search with wrong indentation — exact match fails, line-trimmed succeeds
    const search = `function other() {
      return 42;
    }`;
    const result = applySearchReplace(FILE, search, "function other() {\n  return 99;\n}");
    expect(result).toContain("return 99;");
    expect(result).not.toContain("return 42;");
  });

  it("returns null when snippet is not found", () => {
    expect(applySearchReplace(FILE, "nonexistent code", "x")).toBeNull();
  });

  it("returns null for empty search", () => {
    expect(applySearchReplace(FILE, "", "x")).toBeNull();
  });

  it("preserves untouched parts of the file", () => {
    const result = applySearchReplace(FILE, "return 42;", "return 0;");
    expect(result).toContain('const greeting = "hi";');
    expect(result).toContain("function hello()");
  });
});
