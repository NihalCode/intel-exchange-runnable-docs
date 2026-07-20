import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(
  path.join(process.cwd(), "src/lib/developer/ingest-runtime.ts"),
  "utf8"
);

describe("ingest-runtime spawn safety", () => {
  it("uses process.execPath and argv array without shell:true", () => {
    expect(source).toContain("spawn(process.execPath");
    expect(source).toContain("[script, ...args]");
    expect(source).not.toMatch(/spawn\([^)]*shell\s*:\s*true/);
    expect(source).toMatch(/windowsHide:\s*true/);
    expect(source).not.toMatch(/\bexec\(/);
    expect(source).not.toMatch(/\bexecSync\(/);
  });

  it("is the sole child_process import in application lib (excluding tests)", () => {
    expect(source).toContain('from "node:child_process"');
    expect(source).toContain("export function runIngestScript");
  });
});
