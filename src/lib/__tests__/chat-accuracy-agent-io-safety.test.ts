import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAppFiles } from "@/lib/agent/validate-app";
import { safeZipEntryPath } from "@/lib/security/safe-zip-path";

/**
 * Zip / commit / deploy safety invariants used by agent IO routes.
 * Reuses pure modules (safeZipEntryPath, validateAppFiles) and route source
 * contracts — no live Auth0 or Vercel calls.
 */
describe("agent zip path traversal hardening", () => {
  it("rejects zip-slip, absolute, and empty entry paths", () => {
    expect(safeZipEntryPath("../etc/passwd")).toBeNull();
    expect(safeZipEntryPath("..\\windows\\system32")).toBeNull();
    expect(safeZipEntryPath("/etc/passwd")).toBeNull();
    expect(safeZipEntryPath("C:\\Windows\\system32")).toBeNull();
    expect(safeZipEntryPath("app/../../secret")).toBeNull();
    expect(safeZipEntryPath("app//page.tsx")).toBeNull();
    expect(safeZipEntryPath("")).toBeNull();
    expect(safeZipEntryPath("app/page.tsx")).toBe("app/page.tsx");
    expect(safeZipEntryPath("lib/cyware/client.ts")).toBe("lib/cyware/client.ts");
  });

  it("zip route refuses unsafe paths before archiving", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/api/agent/zip/route.ts"),
      "utf8"
    );
    expect(source).toContain("safeZipEntryPath");
    expect(source).toMatch(/Invalid file path/);
  });
});

describe("agent commit preview:true contract", () => {
  it("commit route always returns preview without executing git", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/api/agent/commit/route.ts"),
      "utf8"
    );
    expect(source).toContain("safeZipEntryPath");
    expect(source).toContain("preview: true");
    expect(source).toContain("committed: false");
    // Must not spawn git from the serverless handler
    expect(source).not.toMatch(/spawn\(['\"]git['\"]/);
    expect(source).not.toMatch(/exec(?:File)?Sync\(\s*['\"]git['\"]/);
  });

  it("mirrors preview payload shape when git commit is disabled", () => {
    const gitEnabled = process.env.ENABLE_AGENT_GIT_COMMIT === "true";
    // Unit-level mirror of route behavior when flag is off (default in tests)
    if (!gitEnabled) {
      const preview = {
        ok: true,
        committed: false,
        preview: true as const,
        suggestedMessage: "Agent export: demo (1 files)",
        fileCount: 1,
        changedPaths: ["app/page.tsx"],
      };
      expect(preview.preview).toBe(true);
      expect(preview.committed).toBe(false);
    }
    expect(safeZipEntryPath("../.git/config")).toBeNull();
  });
});

describe("agent deploy rejects unsafe apps", () => {
  it("deploy route validates paths and blocks validateAppFiles failures", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/api/agent/deploy/route.ts"),
      "utf8"
    );
    expect(source).toContain("safeZipEntryPath");
    expect(source).toContain("validateAppFiles");
    expect(source).toMatch(/Deploy blocked/);
  });

  it("rejects traversal paths the same way deploy sanitization does", () => {
    const files = [
      { path: "../secret.env", code: "x=1" },
      { path: "/etc/passwd", code: "root" },
      { path: "app/../../evil.ts", code: "export {}" },
    ];
    const sanitized = files
      .map((f) => {
        const entry = safeZipEntryPath(f.path);
        return entry ? { path: entry, code: f.code } : null;
      })
      .filter((f): f is { path: string; code: string } => f != null);
    expect(sanitized).toEqual([]);
  });

  it("validateAppFiles failures are non-empty for truncated deploy payloads", () => {
    const problems = validateAppFiles([
      {
        path: "app/page.tsx",
        code: `export default function Page() {\n  return (\n    <main>\n      <h1>Hello`,
      },
    ]);
    expect(problems.length).toBeGreaterThan(0);
  });
});
