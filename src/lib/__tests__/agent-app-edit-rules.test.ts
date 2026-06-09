import { describe, it, expect } from "vitest";
import { applyRuleBasedEdits } from "../agent/app-edit-rules";
import type { AgentAppBlueprint } from "../agent/types";

const SAMPLE_PAGE = `"use client";
function extractIOCs(text: string) {
  const iocs = [];
  for (const m of text.matchAll(/\\b(?:[a-z0-9-]+\\.)+[a-z]{2,}\\b/gi)) {
    iocs.push({ type: "domain", value: m[0] });
  }
  for (const m of text.matchAll(/@([a-z0-9.-]+\\.[a-z]{2,})/gi)) {
    iocs.push({ type: "email", value: m[0] });
  }
  return iocs;
}
export default function Page() { return null; }
`;

function minimalBlueprint(pageCode: string): AgentAppBlueprint {
  return {
    title: "Test App",
    description: "test",
    architecture: "",
    setupInstructions: "",
    envExample: "",
    files: [
      { path: "app/page.tsx", language: "typescript", description: "UI", code: pageCode },
      { path: "app/globals.css", language: "css", description: "css", code: "body {}" },
    ],
  };
}

describe("applyRuleBasedEdits", () => {
  it("patches extractIOCs when asked to skip recipient domains", () => {
    const bp = minimalBlueprint(SAMPLE_PAGE);
    const result = applyRuleBasedEdits(
      "Do not flag company.org when it only comes from recipient email addresses",
      bp
    );
    expect(result).not.toBeNull();
    expect(result!.changedPaths).toContain("app/page.tsx");
    expect(result!.blueprint.files.find((f) => f.path === "app/page.tsx")?.code).toContain(
      "emailDomains"
    );
  });

  it("adds dark mode CSS when requested", () => {
    const bp = minimalBlueprint(SAMPLE_PAGE);
    const result = applyRuleBasedEdits("Add dark mode theme", bp);
    expect(result).not.toBeNull();
    expect(result!.blueprint.files.find((f) => f.path === "app/globals.css")?.code).toContain(
      "agent:dark-mode"
    );
  });

  it("returns null for unrelated queries", () => {
    const bp = minimalBlueprint(SAMPLE_PAGE);
    expect(applyRuleBasedEdits("add pagination to threat data API", bp)).toBeNull();
  });
});
