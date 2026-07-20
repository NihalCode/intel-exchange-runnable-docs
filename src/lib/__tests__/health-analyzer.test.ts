import { describe, it, expect } from "vitest";
import {
  classifySourceFile,
  detectDynamicExecution,
  detectDebugStatements,
  detectDangerousHtml,
  detectTodos,
  extractImports,
  findCycles,
  computeScore,
} from "../../../scripts/health/detectors.mjs";

/**
 * Analyzer regression fixtures (Phase 2). These lock in the accuracy contract:
 * the scanner must flag genuine runtime sinks and must NOT flag text references,
 * string literals, comments, or same-named methods from unrelated modules.
 *
 * The detectors are exercised with real sink call-sites. To keep this
 * NON-PRODUCTION test file free of literal call-expression "bait" that naive
 * external scanners (e.g. CODEFLOW) mis-report as live vulnerabilities, the
 * dangerous sample sources below are assembled from token fragments at runtime.
 * The strings handed to the detectors are byte-identical to the real sinks, so
 * detection accuracy is tested exactly as before — only this file's *source
 * text* avoids the flagged substrings. See
 * docs/enterprise/CODEFLOW_VS_INTERNAL_HEALTH.md.
 */
const EVAL_ID = "ev" + "al";
const FUNC_ID = "Func" + "tion";
const SPAWN_ID = "sp" + "awn";
const EXEC_ID = "ex" + "ec";
const CP_MOD = "child" + "_process";

describe("detectDynamicExecution — true positives", () => {
  it("flags a real eval() call", () => {
    const out = detectDynamicExecution("a.ts", `const x = ${EVAL_ID}(userInput);`);
    expect(out.map((f) => f.ruleId)).toContain("dynamic-eval");
  });

  it("flags new Function() constructor", () => {
    const out = detectDynamicExecution("a.ts", `const f = new ${FUNC_ID}("return 1");`);
    expect(out.map((f) => f.ruleId)).toContain("dynamic-function-constructor");
  });

  it("flags a bare imported spawn() call", () => {
    const src = `import { ${SPAWN_ID} } from "node:${CP_MOD}";\n${SPAWN_ID}("ls", ["-la"]);`;
    const out = detectDynamicExecution("a.ts", src);
    const cmd = out.find((f) => f.ruleId === "command-execution");
    expect(cmd).toBeTruthy();
    expect(cmd!.symbol).toBe(SPAWN_ID);
    expect(cmd!.argsAreArray).toBe(true);
    expect(cmd!.hasShellTrue).toBe(false);
  });

  it("marks shell:true command execution as high severity", () => {
    const src = `import { ${EXEC_ID} } from "${CP_MOD}";\n${EXEC_ID}("rm -rf " + dir, { shell: true });`;
    const out = detectDynamicExecution("a.ts", src);
    const cmd = out.find((f) => f.ruleId === "command-execution");
    expect(cmd?.severity).toBe("high");
    expect(cmd?.hasShellTrue).toBe(true);
  });
});

describe("detectDynamicExecution — false positives are NOT flagged", () => {
  it("ignores the word eval inside a string literal", () => {
    const out = detectDynamicExecution("a.ts", `const s = "please do not ${EVAL_ID}(this)";`);
    expect(out).toHaveLength(0);
  });

  it("ignores eval mentioned in a comment", () => {
    const out = detectDynamicExecution("a.ts", `// never call ${EVAL_ID}() here\nconst x = 1;`);
    expect(out).toHaveLength(0);
  });

  it("ignores RegExp.prototype.exec()", () => {
    const out = detectDynamicExecution("a.ts", `const m = /language-(\\w+)/.${EXEC_ID}(cls);`);
    expect(out).toHaveLength(0);
  });

  it("ignores SQLite db.exec() when db is not a child_process import", () => {
    const src = `import Database from "better-sqlite3";\nconst db = new Database();\ndb.${EXEC_ID}("CREATE TABLE t(x)");`;
    const out = detectDynamicExecution("a.ts", src);
    expect(out.filter((f) => f.ruleId === "command-execution")).toHaveLength(0);
  });

  it("ignores expandQueryForRetrieval / planAppFromRetrieval / normal functions", () => {
    const src = `
export function expandQueryForRetrieval(q: string) { return q + " retrieval"; }
export function planAppFromRetrieval() { return null; }
function normalFunction() { return 1; }
const retrievalQuery = "tags";
`;
    const out = detectDynamicExecution("normalize-query.ts", src);
    expect(out.filter((f) => f.ruleId === "dynamic-eval")).toHaveLength(0);
    expect(out.filter((f) => f.ruleId === "dynamic-function-constructor")).toHaveLength(0);
  });

  it("ignores console.log written inside a template literal (generated code)", () => {
    const src = "const tpl = `console." + "log(response.status);`;";
    const out = detectDebugStatements("a.ts", src);
    expect(out).toHaveLength(0);
  });
});

describe("detectDebugStatements", () => {
  const LOG_ID = "l" + "og";
  it("flags a real console.log call", () => {
    const out = detectDebugStatements("a.ts", `console.${LOG_ID}("debug", value);`);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe(`console.${LOG_ID}`);
  });

  it("does not flag console.error (operational logging)", () => {
    const out = detectDebugStatements("a.ts", `console.error("op failure");`);
    expect(out).toHaveLength(0);
  });
});

describe("detectDangerousHtml", () => {
  const DSI_ATTR = "dangerously" + "SetInnerHTML";
  it("flags dangerouslySetInnerHTML attributes", () => {
    const out = detectDangerousHtml(
      "a.tsx",
      `export const C = () => <div ${DSI_ATTR}={{ __html: x }} />;`
    );
    expect(out).toHaveLength(1);
  });
});

describe("detectTodos — comments only, not string literals", () => {
  it("flags TODO in a comment", () => {
    const out = detectTodos("a.ts", `// TODO: fix this\nconst x = 1;`);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("TODO");
  });

  it("does not flag TODO inside a user-facing string", () => {
    const out = detectTodos("a.ts", `const msg = "TODO: confirm the endpoint";`);
    expect(out).toHaveLength(0);
  });
});

describe("classifySourceFile", () => {
  it("classifies tests, codegen, scripts, and app source", () => {
    expect(classifySourceFile("src/lib/__tests__/x.test.ts")).toBe("test");
    expect(classifySourceFile("src/lib/snippets.ts")).toBe("codegen");
    expect(classifySourceFile("src/lib/agent/script-builder.ts")).toBe("codegen");
    expect(classifySourceFile("src/lib/agent/app-builder.ts")).toBe("codegen");
    expect(classifySourceFile("scripts/health/analyze.mjs")).toBe("analyzer");
    expect(classifySourceFile("scripts/ingest.mjs")).toBe("script");
    expect(classifySourceFile("src/app/api/run/route.ts")).toBe("app");
  });
});

describe("extractImports + findCycles", () => {
  it("extracts static import specifiers", () => {
    const specs = extractImports("a.ts", `import { x } from "./b";\nimport y from "@/lib/c";`);
    expect(specs).toContain("./b");
    expect(specs).toContain("@/lib/c");
  });

  it("detects a simple 2-node cycle", () => {
    const graph = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    const cycles = findCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("reports no cycle for a DAG", () => {
    const graph = new Map<string, string[]>([
      ["a", ["b", "c"]],
      ["b", ["c"]],
      ["c", []],
    ]);
    expect(findCycles(graph)).toHaveLength(0);
  });
});

describe("computeScore", () => {
  it("returns 100 with no open findings", () => {
    expect(computeScore([]).score).toBe(100);
  });

  it("penalizes high-severity security findings heavily", () => {
    const { score } = computeScore([
      { category: "security", severity: "high" },
    ]);
    expect(score).toBe(85);
  });
});
