import { describe, it, expect } from "vitest";
import {
  repairCssFully,
  repairCssOrphans,
  repairAppFiles,
  repairTsFully,
  repairJsonFully,
  stripCodeFences,
} from "../agent/repair-app";
import { validateAppFiles } from "../agent/validate-app";

const BROKEN_FROM_VERCEL = `.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

textarea, input[type="text"] { width: 100%; }`;

const MULTIPLE_STRAY_BRACES = `body { color: #fff; }
}

.btn { padding: 1rem; }
}

.card { border: 1px solid #ccc; }`;

describe("repairCssOrphans", () => {
  it("removes orphaned declaration block from real Vercel failure", () => {
    const { code, fixed } = repairCssOrphans(BROKEN_FROM_VERCEL);
    expect(fixed).toBe(true);
    const problems = validateAppFiles([{ path: "app/globals.css", code }]);
    expect(problems).toEqual([]);
  });

  it("leaves valid CSS unchanged", () => {
    const valid = `.card { padding: 1rem; }\nbody { margin: 0; }`;
    const { code, fixed } = repairCssOrphans(valid);
    expect(fixed).toBe(false);
    expect(code).toBe(valid);
  });
});

describe("repairCssFully", () => {
  it("fixes multiple stray closing braces", () => {
    const { code, notes } = repairCssFully(MULTIPLE_STRAY_BRACES);
    expect(notes.length).toBeGreaterThan(0);
    expect(validateAppFiles([{ path: "app/globals.css", code }])).toEqual([]);
  });
});

describe("stripCodeFences", () => {
  it("strips fences with language tag and leading prose", () => {
    const { code, fixed } = stripCodeFences(
      'Here is the updated file:\n```tsx\nexport default function A() { return <div />; }\n```'
    );
    expect(fixed).toBe(true);
    expect(code).toBe("export default function A() { return <div />; }");
  });

  it("leaves clean code unchanged", () => {
    const clean = "export const x = 1;";
    const { code, fixed } = stripCodeFences(clean);
    expect(fixed).toBe(false);
    expect(code).toBe(clean);
  });
});

describe("repairTsFully", () => {
  it("closes unterminated braces from a truncated edit", () => {
    const truncated = `export async function POST(req: Request) {
  try {
    const data = await req.json();
    return Response.json({ ok: true, data });
  } catch (err) {
    return Response.json({ ok: false }, { status: 500 });`;
    const { code, notes } = repairTsFully(truncated, "app/api/x/route.ts");
    expect(notes.length).toBeGreaterThan(0);
    expect(validateAppFiles([{ path: "app/api/x/route.ts", code }])).toEqual([]);
  });

  it("strips markdown fences from TSX", () => {
    const fenced = "```tsx\nexport default function Page() { return <main>hi</main>; }\n```";
    const { code } = repairTsFully(fenced, "app/page.tsx");
    expect(validateAppFiles([{ path: "app/page.tsx", code }])).toEqual([]);
  });

  it("leaves valid TS unchanged", () => {
    const valid = "export const x: number = 1;\n";
    const { code, notes } = repairTsFully(valid, "lib/x.ts");
    expect(notes).toEqual([]);
    expect(code).toBe(valid);
  });

  it("does not falsely close braces inside strings or template literals", () => {
    const tricky =
      'const a = "{ not a brace";\nconst b = `open { inside ${"x"} template`;\nexport { a, b };\n';
    const { code, notes } = repairTsFully(tricky, "lib/y.ts");
    expect(notes).toEqual([]);
    expect(code).toBe(tricky);
  });
});

describe("repairJsonFully", () => {
  it("removes trailing commas", () => {
    const { code, notes } = repairJsonFully('{ "name": "x", "deps": { "a": "1", }, }');
    expect(notes.length).toBeGreaterThan(0);
    expect(JSON.parse(code)).toEqual({ name: "x", deps: { a: "1" } });
  });

  it("removes JS-style comments", () => {
    const { code } = repairJsonFully('{\n// comment\n"name": "x"\n}');
    expect(JSON.parse(code)).toEqual({ name: "x" });
  });

  it("strips markdown fences", () => {
    const { code } = repairJsonFully('```json\n{ "a": 1 }\n```');
    expect(JSON.parse(code)).toEqual({ a: 1 });
  });

  it("leaves valid JSON unchanged", () => {
    const valid = '{ "a": 1 }';
    const { code, notes } = repairJsonFully(valid);
    expect(notes).toEqual([]);
    expect(code).toBe(valid);
  });
});

describe("repairAppFiles", () => {
  it("repairs globals.css and passes validation at deploy", () => {
    const { files, notes } = repairAppFiles([
      { path: "app/globals.css", code: BROKEN_FROM_VERCEL },
      { path: "package.json", code: '{"name":"x"}' },
    ]);
    expect(notes.length).toBeGreaterThan(0);
    const css = files.find((f) => f.path === "app/globals.css")!.code;
    expect(validateAppFiles([{ path: "app/globals.css", code: css }])).toEqual([]);
  });

  it("repairs every language in one pass: CSS, TS, and JSON", () => {
    const { files, notes } = repairAppFiles([
      { path: "app/globals.css", code: MULTIPLE_STRAY_BRACES },
      { path: "app/api/x/route.ts", code: "export function GET() {\n  return Response.json({ ok: true });" },
      { path: "package.json", code: '{ "name": "x", }' },
    ]);
    expect(notes.length).toBeGreaterThanOrEqual(3);
    expect(validateAppFiles(files)).toEqual([]);
  });
});
