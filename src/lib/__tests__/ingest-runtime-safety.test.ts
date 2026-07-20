import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  INGEST_SCRIPT_RELATIVE,
  validateIngestArgv,
} from "@/lib/developer/ingest-runtime";

const source = readFileSync(
  path.join(process.cwd(), "src/lib/developer/ingest-runtime.ts"),
  "utf8"
);

describe("ingest-runtime spawn safety", () => {
  it("uses process.execPath, argv array, and shell:false", () => {
    expect(source).toContain("spawn(process.execPath");
    expect(source).toContain("[script, ...args]");
    expect(source).toMatch(/shell:\s*false/);
    expect(source).not.toMatch(/shell\s*:\s*true/);
    expect(source).toMatch(/windowsHide:\s*true/);
    expect(source).toContain("INGEST_SCRIPT_RELATIVE");
    expect(source).not.toMatch(/\bexecSync\(/);
  });

  it("is the sole child_process import in application lib (excluding tests)", () => {
    expect(source).toContain('from "node:child_process"');
    expect(source).toContain("export function runIngestScript");
  });

  it("rejects shell metacharacters and unknown flags", () => {
    expect(validateIngestArgv(["--product=ctix"])).toBeNull();
    expect(validateIngestArgv(["--product=ctix; rm -rf /"])).toMatch(/metacharacters/);
    expect(validateIngestArgv(["--evil=1"])).toMatch(/unsupported/);
    expect(validateIngestArgv(["--collection-file=/tmp/a/../etc/passwd"])).toMatch(
      /path traversal/
    );
    expect(INGEST_SCRIPT_RELATIVE.replace(/\\/g, "/")).toBe("scripts/ingest.mjs");
  });

  it("scrubs session secrets from child env helper", () => {
    expect(source).toContain("delete base.AUTH0_CLIENT_SECRET");
    expect(source).toContain("delete base.CSRF_SIGNING_SECRET");
  });
});
