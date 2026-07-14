import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isProtectedDocumentationPath } from "@/lib/documentation-auth/proxy-auth";

function source(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("documentation UI credential boundaries", () => {
  it("keeps credential and base URL controls out of the application header", () => {
    const appShell = source("src/components/AppShell.tsx");
    expect(appShell).not.toContain("ApiConnectionPanel");
    expect(appShell).not.toContain("credentialsConfigured");
    expect(appShell).not.toContain("Connect CTIX");
  });

  it("renders a credential-locked agent state", () => {
    const agentPage = source("src/app/agent/page.tsx");
    expect(agentPage).toContain("Connect a product to continue");
    expect(agentPage).toContain('href="/authentication"');
    expect(agentPage.indexOf("credentialReady ?")).toBeLessThan(
      agentPage.indexOf("<AgentChat")
    );
  });

  it("passes credentialed products into the agent chat", () => {
    const agentPage = source("src/app/agent/page.tsx");
    expect(agentPage).toContain("credentialedProducts");
    expect(agentPage).toContain("listValidCredentialProductIds");
  });

  it("allows public docs while protecting application areas", () => {
    for (const route of ["/", "/docs/ctix", "/guides", "/changelog"]) {
      expect(isProtectedDocumentationPath(route)).toBe(false);
    }
    for (const route of ["/agent", "/authentication", "/settings/profile", "/admin", "/developer"]) {
      expect(isProtectedDocumentationPath(route)).toBe(true);
    }
    expect(isProtectedDocumentationPath("/sign-in")).toBe(false);
  });
});
