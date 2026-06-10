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

  it("passes valid JSON and ignores CSS/MD files", () => {
    const problems = validateAppFiles([
      { path: "package.json", code: `{ "name": "x" }` },
      { path: "app/globals.css", code: "body { color: red;" },
      { path: "README.md", code: "# hi" },
    ]);
    expect(problems).toEqual([]);
  });
});
