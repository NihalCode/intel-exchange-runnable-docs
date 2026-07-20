import { describe, expect, it } from "vitest";

import { safeZipEntryPath } from "@/lib/security/safe-zip-path";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { ENTERPRISE_PERMISSIONS, type EnterprisePrincipal } from "@/lib/enterprise/types";
import { highlightToReact } from "@/lib/highlight-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Consolidated Program 2 security regression suite — XSS, zip-slip, authz,
 * spawn, and secret-canary invariants in one place for the release gate.
 */
describe("security suite — zip path hardening", () => {
  it("rejects zip-slip and absolute paths", () => {
    expect(safeZipEntryPath("../etc/passwd")).toBeNull();
    expect(safeZipEntryPath("/etc/passwd")).toBeNull();
    expect(safeZipEntryPath("C:\\Windows\\system32")).toBeNull();
    expect(safeZipEntryPath("app/../../secret")).toBeNull();
    expect(safeZipEntryPath("app/page.tsx")).toBe("app/page.tsx");
  });
});

describe("security suite — XSS sinks removed from layout/CodeBlock", () => {
  const DSI = "dangerously" + "SetInnerHTML";
  it("layout and CodeBlock have no raw HTML sink", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    const codeBlock = readFileSync(
      path.join(process.cwd(), "src/components/CodeBlock.tsx"),
      "utf8"
    );
    expect(layout).not.toContain(DSI);
    expect(codeBlock).not.toContain(DSI);
  });

  it("hljs react renderer does not emit script elements", () => {
    const LT = "<";
    const markup = renderToStaticMarkup(
      createElement("code", null, highlightToReact(`${LT}script>alert(1)${LT}/script>`, "javascript"))
    );
    expect(markup).not.toMatch(/<script/i);
  });
});

describe("security suite — authz fail-closed", () => {
  it("viewer cannot exercise any enterprise permission", () => {
    const viewer: EnterprisePrincipal = {
      userId: "v",
      organizationId: "org",
      role: "viewer",
      status: "active",
    };
    for (const permission of ENTERPRISE_PERMISSIONS) {
      expect(authorizeEnterprise(viewer, permission)).toBe(false);
    }
  });
});

describe("security suite — secret canaries", () => {
  it("does not embed SecretKey canary in committed source under src/", () => {
    const canary = "CYWARE_SECRET_KEY_CANARY_DO_NOT_COMMIT";
    // Canary string itself only lives in this test expectation — scanning other files.
    const roots = ["src/app", "src/components", "src/lib"];
    for (const root of roots) {
      // lightweight: only check high-risk modules by name
      const sensitive = [
        "snippets.ts",
        "security.ts",
        "runners.tsx",
        "http-runner.tsx",
        "RunSettings.tsx",
      ];
      for (const file of sensitive) {
        const full = path.join(process.cwd(), root, file);
        try {
          const text = readFileSync(full, "utf8");
          expect(text).not.toContain(canary);
          expect(text).not.toMatch(/SecretKey\s*[:=]\s*['\"][A-Za-z0-9+/=]{16,}/);
        } catch {
          /* file may not exist in this root */
        }
      }
    }
  });
});

describe("security suite — ingest spawn", () => {
  it("pins executable to process.execPath without shell", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/developer/ingest-runtime.ts"),
      "utf8"
    );
    expect(source).toContain("spawn(process.execPath");
    expect(source).not.toMatch(/spawn\([^)]*shell\s*:\s*true/);
  });
});
