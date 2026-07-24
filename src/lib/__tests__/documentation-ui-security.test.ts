import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isProtectedDocumentationPath } from "@/lib/documentation-auth/proxy-auth";

function source(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("documentation UI credential boundaries", () => {
  it("keeps credential and base URL controls out of the application header", () => {
    const appFrame = source("src/components/AppFrame.tsx");
    expect(appFrame).not.toContain("ApiConnectionPanel");
    expect(appFrame).not.toContain("credentialsConfigured");
    expect(appFrame).not.toContain("Connect CTIX");
  });

  it("renders a credential-locked agent state", () => {
    const agentPage = source("src/app/agent/page.tsx");
    expect(agentPage).toContain("Connect a product to continue");
    expect(agentPage).toContain('href="/authentication"');
    expect(agentPage).toContain("canUseAgentWithoutStoredProductSecrets");
    expect(agentPage.indexOf("credentialReady ?")).toBeLessThan(
      agentPage.indexOf("<AgentChat")
    );
  });

  it("passes credentialed products into the agent chat", () => {
    const agentPage = source("src/app/agent/page.tsx");
    expect(agentPage).toContain("credentialedProducts");
    expect(agentPage).toContain("listValidCredentialProductIds");
    expect(agentPage).toContain("mergeEnsuredProductIds");
  });

  it("protects privileged application areas behind authentication", () => {
    for (const route of [
      "/authentication",
      "/settings/profile",
      "/admin",
      "/developer",
    ]) {
      expect(isProtectedDocumentationPath(route)).toBe(true);
    }
    expect(isProtectedDocumentationPath("/sign-in")).toBe(false);
    expect(isProtectedDocumentationPath("/agent")).toBe(false);
    expect(isProtectedDocumentationPath("/docs/ctix")).toBe(false);
  });

  it("aligns snippet Run UI with test_snippets permission (not role!==viewer)", () => {
    const codeBlock = source("src/components/CodeBlock.tsx");
    expect(codeBlock).toContain('hasPermission("test_snippets")');
    expect(codeBlock).not.toContain('role !== "viewer"');
    expect(codeBlock).toContain("state.authenticated");
  });

  it("gates signed-in Viewer Ask AI on viewer_ask_ai_access_enabled", () => {
    const agentPage = source("src/app/agent/page.tsx");
    expect(agentPage).toContain("resolveViewerAskAiAccessEnabled");
    expect(agentPage).toContain('session.user.role === "viewer"');
    expect(agentPage).toContain("notFound()");
    expect(agentPage).toContain("Unsigned viewers");
  });
});
