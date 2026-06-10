import { describe, it, expect } from "vitest";
import { validateAppFiles } from "../agent/validate-app";

describe("validateAppFiles", () => {
  it("passes valid TSX", () => {
    const problems = validateAppFiles([
      {
        path: "app/page.tsx",
        code: `"use client";
export default function Page() {
  return <main className="container"><h1>Hello</h1></main>;
}`,
      },
    ]);
    expect(problems).toEqual([]);
  });

  it("passes valid TS API route", () => {
    const problems = validateAppFiles([
      {
        path: "app/api/x/route.ts",
        code: `export async function POST(req: Request) {
  const body = await req.json();
  return Response.json({ ok: true, body });
}`,
      },
    ]);
    expect(problems).toEqual([]);
  });

  it("catches truncated TSX (unterminated JSX)", () => {
    const problems = validateAppFiles([
      {
        path: "app/page.tsx",
        code: `export default function Page() {
  return (
    <main>
      <h1>Hello`,
      },
    ]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].path).toBe("app/page.tsx");
  });

  it("catches unbalanced braces", () => {
    const problems = validateAppFiles([
      {
        path: "lib/util.ts",
        code: `export function f() {
  if (true) {
    return 1;
}`,
      },
    ]);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("catches invalid JSON", () => {
    const problems = validateAppFiles([
      { path: "package.json", code: `{ "name": "x", }` },
    ]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].error).toContain("JSON");
  });

  it("passes valid JSON and ignores MD files", () => {
    const problems = validateAppFiles([
      { path: "package.json", code: `{ "name": "x" }` },
      { path: "README.md", code: "# hi" },
    ]);
    expect(problems).toEqual([]);
  });

  it("passes valid CSS", () => {
    const problems = validateAppFiles([
      {
        path: "app/globals.css",
        code: `body { color: red; }
.card { border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
@media (max-width: 600px) { .card { padding: 1rem; } }`,
      },
    ]);
    expect(problems).toEqual([]);
  });

  it("catches orphaned closing brace in CSS (real Vercel build failure)", () => {
    const problems = validateAppFiles([
      {
        path: "app/globals.css",
        code: `  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

textarea, input[type="text"] { width: 100%; }`,
      },
    ]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].path).toBe("app/globals.css");
    expect(problems[0].error).toContain("CSS");
  });

  it("catches unclosed block in CSS", () => {
    const problems = validateAppFiles([
      { path: "app/globals.css", code: "body { color: red;" },
    ]);
    expect(problems.length).toBeGreaterThan(0);
  });
});
