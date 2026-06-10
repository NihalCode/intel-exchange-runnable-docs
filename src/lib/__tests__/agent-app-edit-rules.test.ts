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
      { path: "app/layout.tsx", language: "typescript", description: "Layout", code: `import "./globals.css";\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n` },
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
    expect(css).toContain(".card {");
    expect(css).toContain("upload-list");

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

describe("theme switcher rule-based edit", () => {
  const THEME_PROMPT = `Add a theme switcher so users can toggle between light mode and dark mode.
Default to dark mode, save selected theme in local storage, respect system theme only when no saved preference exists.
Make dark mode vivid with --cyware-dark, gradients, glassmorphism, and glows.`;

  it("injects a working theme switcher into an old-template app", () => {
    const bp = minimalBlueprint(OLD_TEMPLATE_PAGE);
    const result = applyRuleBasedEdits(THEME_PROMPT, bp);

    expect(result).not.toBeNull();
    expect(result!.changedPaths).toContain("app/page.tsx");
    expect(result!.changedPaths).toContain("app/globals.css");
    expect(result!.changedPaths).toContain("app/layout.tsx");
    expect(result!.summary).toContain("theme switcher");

    const page = result!.blueprint.files.find((f) => f.path === "app/page.tsx")!.code;
    expect(page).toContain('import { useState, useEffect } from "react";');
    expect(page).toContain('useState<"light" | "dark">("dark")');
    expect(page).toContain('localStorage.getItem("cyware-theme")');
    expect(page).toContain('localStorage.setItem("cyware-theme", theme)');
    expect(page).toContain("prefers-color-scheme: light");
    expect(page).toContain("agent:theme-switcher");
    expect(page).toContain("theme-toggle");

    const css = result!.blueprint.files.find((f) => f.path === "app/globals.css")!.code;
    expect(css).toContain(".card {");
    expect(css).toContain("--cyware-dark");
    expect(css).toContain("radial-gradient");
    expect(css).toContain(".theme-toggle");

    const layout = result!.blueprint.files.find((f) => f.path === "app/layout.tsx")!.code;
    expect(layout).toContain('data-theme="dark"');

    expect(
      validateAppFiles(result!.blueprint.files.map((f) => ({ path: f.path, code: f.code })))
    ).toEqual([]);
  });

  it("does not double-apply the theme switcher", () => {
    const bp = minimalBlueprint(OLD_TEMPLATE_PAGE);
    const once = applyRuleBasedEdits(THEME_PROMPT, bp)!;
    expect(applyRuleBasedEdits(THEME_PROMPT, once.blueprint)).toBeNull();
  });

  it("handles files that already import useEffect", () => {
    const bp = minimalBlueprint(
      OLD_TEMPLATE_PAGE.replace(
        'import { useState } from "react";',
        'import { useState, useEffect } from "react";'
      )
    );
    const result = applyRuleBasedEdits(THEME_PROMPT, bp);
    expect(result).not.toBeNull();
    const page = result!.blueprint.files.find((f) => f.path === "app/page.tsx")!.code;
    expect(page.match(/useEffect/g)?.length).toBeGreaterThanOrEqual(3);
    expect(page).not.toContain("useEffect, useEffect");
  });
});

describe("repair UI rule-based edit", () => {
  it("restores full stylesheet when globals.css was truncated by a bad edit", () => {
    const themedPage = applyRuleBasedEdits(
      "Add a theme switcher with light and dark mode",
      minimalBlueprint(OLD_TEMPLATE_PAGE)
    )!.blueprint.files.find((f) => f.path === "app/page.tsx")!.code;

    const brokenCss = "/* agent:theme-switcher */\n.theme-toggle { color: #fff; }\n";
    const bp = minimalBlueprint(themedPage);
    bp.files = bp.files.map((f) => (f.path === "app/globals.css" ? { ...f, code: brokenCss } : f));

    const result = applyRuleBasedEdits("Fix the broken UI and restore styling so npm run build works", bp);
    expect(result).not.toBeNull();

    const css = result!.blueprint.files.find((f) => f.path === "app/globals.css")!.code;
    expect(css).toContain(".card {");
    expect(css).toContain(".btn-primary");
    expect(css).toContain("agent:theme-switcher");
    expect(css.length).toBeGreaterThan(3000);
    expect(validateAppFiles(result!.blueprint.files.map((f) => ({ path: f.path, code: f.code })))).toEqual([]);
  });
});
