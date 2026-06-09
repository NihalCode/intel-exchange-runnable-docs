import { describe, it, expect } from "vitest";
import { diffAppFiles, slugifyProjectName } from "../agent/app-diff";

describe("diffAppFiles", () => {
  it("detects added, removed, and modified files", () => {
    const oldFiles = [
      { path: "app/page.tsx", code: "line1\nline2\n" },
      { path: "README.md", code: "# Old\n" },
    ];
    const newFiles = [
      { path: "app/page.tsx", code: "line1\nline2 changed\n" },
      { path: "app/layout.tsx", code: "export default function Layout(){}\n" },
    ];

    const diff = diffAppFiles(oldFiles, newFiles, "test");
    expect(diff.stats.modified).toBe(1);
    expect(diff.stats.added).toBe(1);
    expect(diff.stats.removed).toBe(1);
    expect(diff.files.map((f) => f.path).sort()).toEqual(["README.md", "app/layout.tsx", "app/page.tsx"]);
  });
});

describe("slugifyProjectName", () => {
  it("slugifies titles for Vercel", () => {
    expect(slugifyProjectName("Phishing Email Analyzer")).toBe("phishing-email-analyzer");
  });
});
