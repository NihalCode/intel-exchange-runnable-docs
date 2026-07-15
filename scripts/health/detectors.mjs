// Pure, AST-aware detectors for the code-health analyzer.
//
// Design goal (Phase 2 of the remediation prompt): distinguish *runtime*
// dangerous behaviour from text that merely mentions it. Every detector parses
// TypeScript/TSX with the compiler AST so that:
//   - `eval` inside a string literal or comment is NOT reported,
//   - `console.log(...)` inside a template literal (generated code) is NOT
//     reported,
//   - only genuine call expressions to dangerous sinks are surfaced.
//
// These functions are deterministic and dependency-light (only `typescript`,
// already a dev dependency) so they can be unit-tested from Vitest against
// true-positive and false-positive fixtures.

import ts from "typescript";
import path from "node:path";

/** @typedef {"critical"|"high"|"medium"|"low"|"info"} Severity */

/** Classify a file by its role so findings can be scored separately. */
export function classifySourceFile(relPath) {
  const p = relPath.replace(/\\/g, "/");
  if (p.includes("/__tests__/") || /\.(test|spec)\.[cm]?tsx?$/.test(p)) {
    return "test";
  }
  if (p.startsWith("e2e/")) return "test";
  if (p.startsWith("scripts/health/")) return "analyzer";
  if (p.startsWith("scripts/")) return "script";
  // Files that emit source code as template strings for the user to download.
  if (
    p.endsWith("src/lib/agent/script-builder.ts") ||
    p.endsWith("src/lib/snippets.ts")
  ) {
    return "codegen";
  }
  if (p.startsWith("src/")) return "app";
  return "other";
}

function createSource(fileName, text) {
  const scriptKind = fileName.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  return ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind
  );
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function walk(node, cb) {
  cb(node);
  node.forEachChild((child) => walk(child, cb));
}

/**
 * Resolve which local identifiers refer to `child_process` command sinks.
 * Returns { named: Set<localName>, namespaces: Set<localName> } so that only
 * genuine child_process calls are flagged — `regexp.exec()` and SQLite
 * `db.exec()` are intentionally NOT command execution and must be ignored.
 */
function resolveChildProcessBindings(source) {
  const named = new Set();
  const namespaces = new Set();
  const shellSinks = new Set([
    "exec",
    "execSync",
    "spawn",
    "spawnSync",
    "execFile",
    "execFileSync",
    "fork",
  ]);
  const isCp = (spec) => spec === "child_process" || spec === "node:child_process";

  walk(source, (node) => {
    // import { spawn, exec as run } from "node:child_process"
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isCp(node.moduleSpecifier.text) &&
      node.importClause
    ) {
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        namespaces.add(bindings.name.text);
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          const original = (el.propertyName || el.name).text;
          if (shellSinks.has(original)) named.add(el.name.text);
        }
      }
      if (node.importClause.name) {
        // default import — treat as namespace object
        namespaces.add(node.importClause.name.text);
      }
    }
    // const cp = require("child_process")
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "require" &&
      node.initializer.arguments[0] &&
      ts.isStringLiteral(node.initializer.arguments[0]) &&
      isCp(node.initializer.arguments[0].text) &&
      ts.isIdentifier(node.name)
    ) {
      namespaces.add(node.name.text);
    }
  });
  return { named, namespaces, shellSinks };
}

/**
 * Detect genuine dynamic-code-execution and command-execution call sites.
 * Only real CallExpression / NewExpression nodes are reported — strings and
 * comments are ignored by construction because they are not call expressions.
 * Command execution is only flagged when the callee resolves to a
 * `child_process` import (provenance-aware), so RegExp/SQLite `.exec()` and
 * other same-named methods are not misreported.
 */
export function detectDynamicExecution(fileName, text) {
  const source = createSource(fileName, text);
  /** @type {Array<{ruleId:string,line:number,symbol:string,evidence:string,severity:Severity,argsAreArray:boolean,hasShellTrue:boolean}>} */
  const findings = [];
  const { named, namespaces, shellSinks } = resolveChildProcessBindings(source);

  const collectShellOptions = (args) => {
    const secondArg = args[1];
    const argsAreArray = !!secondArg && ts.isArrayLiteralExpression(secondArg);
    let hasShellTrue = false;
    for (const arg of args) {
      if (ts.isObjectLiteralExpression(arg)) {
        for (const prop of arg.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            prop.name &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === "shell" &&
            prop.initializer.kind === ts.SyntaxKind.TrueKeyword
          ) {
            hasShellTrue = true;
          }
        }
      }
    }
    return { argsAreArray, hasShellTrue };
  };

  walk(source, (node) => {
    // eval(...) — direct identifier call
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "eval"
    ) {
      findings.push({
        ruleId: "dynamic-eval",
        line: lineOf(source, node),
        symbol: "eval",
        evidence: node.getText(source).slice(0, 120),
        severity: "critical",
        argsAreArray: false,
        hasShellTrue: false,
      });
    }

    // new Function(...) or Function(...) constructor
    const isFunctionCtor =
      (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Function";
    if (isFunctionCtor) {
      findings.push({
        ruleId: "dynamic-function-constructor",
        line: lineOf(source, node),
        symbol: "Function",
        evidence: node.getText(source).slice(0, 120),
        severity: "critical",
        argsAreArray: false,
        hasShellTrue: false,
      });
    }

    // child_process command execution — only when provenance-resolved.
    if (ts.isCallExpression(node)) {
      let sinkName = null;
      // Bare call to a named import: spawn(...), execFile(...)
      if (ts.isIdentifier(node.expression) && named.has(node.expression.text)) {
        sinkName = node.expression.text;
      }
      // Namespace member call: cp.spawn(...), childProcess.exec(...)
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        namespaces.has(node.expression.expression.text) &&
        shellSinks.has(node.expression.name.text)
      ) {
        sinkName = node.expression.name.text;
      }
      if (sinkName) {
        const { argsAreArray, hasShellTrue } = collectShellOptions(node.arguments);
        findings.push({
          ruleId: "command-execution",
          line: lineOf(source, node),
          symbol: sinkName,
          evidence: node.getText(source).slice(0, 140),
          // A fixed-executable spawn with an argument array and no shell:true is
          // materially safer than a shell string; reflect that in severity.
          severity: hasShellTrue || !argsAreArray ? "high" : "low",
          argsAreArray,
          hasShellTrue,
        });
      }
    }
  });

  return findings;
}

/**
 * Detect JSX `dangerouslySetInnerHTML` usage. Reports the source expression so
 * the reviewer can trace whether the HTML is sanitized/escaped.
 */
export function detectDangerousHtml(fileName, text) {
  const source = createSource(fileName, text);
  const findings = [];
  walk(source, (node) => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "dangerouslySetInnerHTML"
    ) {
      findings.push({
        ruleId: "xss-dangerous-html",
        line: lineOf(source, node),
        symbol: "dangerouslySetInnerHTML",
        evidence: node.getText(source).slice(0, 140),
        severity: "high",
      });
    }
  });
  return findings;
}

/**
 * Detect real `console.*` debug calls. Because we walk the AST, `console.log`
 * text embedded inside a template literal (generated code) is NOT a
 * CallExpression and is therefore correctly ignored.
 */
export function detectDebugStatements(fileName, text) {
  const source = createSource(fileName, text);
  const findings = [];
  const debugMethods = new Set(["log", "debug", "trace", "info"]);
  walk(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "console" &&
      debugMethods.has(node.expression.name.text)
    ) {
      findings.push({
        ruleId: "debug-console",
        line: lineOf(source, node),
        symbol: `console.${node.expression.name.text}`,
        evidence: node.getText(source).slice(0, 120),
        severity: "low",
      });
    }
  });
  return findings;
}

/**
 * Detect TODO/FIXME/HACK/XXX markers that appear in *comments only* (not in
 * user-facing string literals). Uses the scanner with trivia enabled so string
 * contents are never mistaken for a code TODO.
 */
export function detectTodos(fileName, text) {
  const findings = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.Standard,
    text
  );
  const marker = /\b(TODO|FIXME|HACK|XXX)\b/;
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const commentText = scanner.getTokenText();
      const m = marker.exec(commentText);
      if (m) {
        const pos = scanner.getTokenStart();
        const line = text.slice(0, pos).split(/\r\n|\r|\n/).length;
        findings.push({
          ruleId: "todo-comment",
          line,
          symbol: m[1],
          evidence: commentText.replace(/\s+/g, " ").trim().slice(0, 120),
          severity: "info",
        });
      }
    }
    token = scanner.scan();
  }
  return findings;
}

/** Count non-empty source lines for long-file detection. */
export function countLines(text) {
  return text.split(/\r\n|\r|\n/).length;
}

/** Extract module specifiers (static + dynamic imports, re-exports). */
export function extractImports(fileName, text) {
  const source = createSource(fileName, text);
  const specifiers = [];
  walk(source, (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    // import type X = require("...") and typeof imports are rare; skip.
  });
  return specifiers;
}

/**
 * Resolve a module specifier against the known file set.
 * @param {string} fromFile absolute path of the importing file
 * @param {string} spec module specifier
 * @param {string} srcRoot absolute path to src/
 * @param {Set<string>} fileSet set of absolute file paths present
 */
export function resolveSpecifier(fromFile, spec, srcRoot, fileSet) {
  let base;
  if (spec.startsWith("@/")) {
    base = path.join(srcRoot, spec.slice(2));
  } else if (spec.startsWith("./") || spec.startsWith("../")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null; // external package
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

/**
 * Build an import graph and return all simple cycles (as arrays of file paths).
 * Uses iterative DFS with a recursion stack to detect back edges.
 * @param {Map<string, string[]>} graph adjacency list of absolute paths
 */
export function findCycles(graph) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  for (const node of graph.keys()) color.set(node, WHITE);
  const cycles = [];
  const seen = new Set();

  function dfs(node, stack) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      if (!graph.has(next)) continue;
      if (color.get(next) === GRAY) {
        // Found a back edge -> extract cycle from stack.
        const idx = stack.indexOf(next);
        if (idx !== -1) {
          const cycle = stack.slice(idx);
          const key = [...cycle].sort().join("|");
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push([...cycle, next]);
          }
        }
      } else if (color.get(next) === WHITE) {
        dfs(next, stack);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of graph.keys()) {
    if (color.get(node) === WHITE) dfs(node, []);
  }
  return cycles;
}

/**
 * Compute a transparent, category-weighted health score from OPEN findings.
 * Accepted / false-positive / intentional-safe findings must be filtered out by
 * the caller before scoring; this function only penalizes genuine open issues.
 */
export const SEVERITY_PENALTY = {
  critical: 25,
  high: 15,
  medium: 6,
  low: 2,
  info: 0.5,
};

export const CATEGORY_WEIGHT = {
  security: 1,
  architecture: 1,
  complexity: 0.5,
  duplication: 0.5,
  debug: 1,
  todo: 1,
  testing: 1,
  naming: 0.5,
};

export function computeScore(openFindings) {
  let penalty = 0;
  const byCategory = {};
  for (const f of openFindings) {
    const sev = SEVERITY_PENALTY[f.severity] ?? 0;
    const weight = CATEGORY_WEIGHT[f.category] ?? 1;
    const p = sev * weight;
    penalty += p;
    byCategory[f.category] = (byCategory[f.category] || 0) + p;
  }
  const score = Math.max(0, Math.round((100 - penalty) * 10) / 10);
  return { score, penalty: Math.round(penalty * 10) / 10, byCategory };
}
