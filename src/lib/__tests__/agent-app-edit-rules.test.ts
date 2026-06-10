import { describe, it, expect } from "vitest";
import { applyRuleBasedEdits } from "../agent/app-edit-rules";
import { validateAppFiles } from "../agent/validate-app";
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

// Mimics the old phishing template structure (pre-upload): the anchors the
// upload patch relies on — checking state, a textarea, export default.
const OLD_TEMPLATE_PAGE = `"use client";

import { useState } from "react";

export default function PhishingAnalyzerPage() {
  const [emailText, setEmailText] = useState("");
  const [checking, setChecking] = useState(false);

  function handleExtract() {
    setChecking(false);
  }

  return (
    <main className="container">
      <div className="card">
        <h2>Email Content</h2>
        <textarea
          rows={8}
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
        />
        <div className="toolbar">
          <button type="button" onClick={handleExtract}>Extract IOCs</button>
        </div>
      </div>
    </main>
  );
}
`;

describe("file upload rule-based edit", () => {
  it("injects a working upload feature into an old-template app", () => {
    const bp = minimalBlueprint(OLD_TEMPLATE_PAGE);
    const result = applyRuleBasedEdits(
      "Add file upload support below the email text box with drag-and-drop",
      bp
    );
    expect(result).not.toBeNull();
    expect(result!.changedPaths).toContain("app/page.tsx");
    expect(result!.changedPaths).toContain("app/globals.css");

    const page = result!.blueprint.files.find((f) => f.path === "app/page.tsx")!.code;
    expect(page).toContain("handleUploadFiles");
    expect(page).toContain("UPLOAD_MAX_BYTES");
    expect(page).toContain("upload-zone");
    expect(page).toContain("formatUploadBytes");
    // validation: type whitelist + size cap + no execution
    expect(page).toContain("Unsupported file type");
    expect(page).toContain("File exceeds 10 MB limit");

    const css = result!.blueprint.files.find((f) => f.path === "app/globals.css")!.code;
    expect(css).toContain("agent:file-upload");

    // The patched app must still pass full syntax validation
    expect(
      validateAppFiles(result!.blueprint.files.map((f) => ({ path: f.path, code: f.code })))
    ).toEqual([]);
  });

  it("does not double-apply when the app already has uploads", () => {
    const bp = minimalBlueprint(OLD_TEMPLATE_PAGE);
    const once = applyRuleBasedEdits("add file upload", bp)!;
    expect(applyRuleBasedEdits("add file upload", once.blueprint)).toBeNull();
  });

  it("skips apps that already have the new-template upload feature", () => {
    const withUploads = OLD_TEMPLATE_PAGE.replace(
      "function handleExtract()",
      "async function extractTextFromFile() {}\n  function handleExtract()"
    );
    const bp = minimalBlueprint(withUploads);
    expect(applyRuleBasedEdits("add drag and drop upload", bp)).toBeNull();
  });
});
