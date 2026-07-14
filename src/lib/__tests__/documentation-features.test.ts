import { describe, expect, it } from "vitest";

import {
  defaultDocumentationFeatureEnabled,
  DOCUMENTATION_FEATURE_KEYS,
} from "@/lib/documentation-features";

describe("documentation feature defaults", () => {
  it("fails closed for every builder, project, and deployment feature", () => {
    const offByDefault = [
      "app_builder",
      "project_workspace",
      "preview",
      "vercel_deployment",
      "git_commit",
      "project_download",
      "vercel_import",
      "api_testing_console",
    ] as const;
    for (const key of offByDefault) {
      expect(defaultDocumentationFeatureEnabled(key)).toBe(false);
    }
    expect(DOCUMENTATION_FEATURE_KEYS).toContain("ai_documentation_assistant");
  });

  it("keeps support and placeholder admin modules disabled by default", () => {
    expect(DOCUMENTATION_FEATURE_KEYS).toContain("support_agent");
    expect(DOCUMENTATION_FEATURE_KEYS).toContain("placeholder_admin_modules");
    expect(defaultDocumentationFeatureEnabled("support_agent")).toBe(false);
    expect(defaultDocumentationFeatureEnabled("placeholder_admin_modules")).toBe(false);
  });
});
