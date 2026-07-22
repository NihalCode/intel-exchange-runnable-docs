import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CredentialManager CSRF source", () => {
  it("fetches CSRF from /api/auth/csrf via getCsrfToken, not admin control-plane", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/authentication/CredentialManager.tsx"),
      "utf8"
    );
    expect(source).toContain('from "@/lib/csrf-client"');
    expect(source).toContain("getCsrfToken");
    expect(source).toMatch(/\/api\/auth\/csrf|getCsrfToken\(true\)/);
    expect(source).not.toMatch(
      /fetch\(\s*["']\/api\/admin\/control-plane\/context["']/
    );
  });
});
