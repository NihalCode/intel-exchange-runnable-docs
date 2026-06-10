import postcss from "postcss";
import ts from "typescript";
import { defaultGlobalsCss } from "./app-builder";
import type { AgentAppBlueprint } from "./types";
import { validateAppFiles } from "./validate-app";

/**
 * Remove orphaned CSS declaration blocks left behind when an AI edit deletes
 * a selector but keeps its properties + closing brace.
 */
export function repairCssOrphans(code: string): { code: string; fixed: boolean } {
  const lines = code.split("\n");
  const out: string[] = [];
  let fixed = false;
  let i = 0;

  function prevNonEmpty(): string {
    for (let j = out.length - 1; j >= 0; j--) {
      const t = out[j].trim();
      if (t) return t;
    }
    return "";
  }

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s+[a-z-]+:\s/.test(line) && prevNonEmpty() === "}") {
      fixed = true;
      while (i < lines.length && lines[i].trim() !== "}") i++;
      if (i < lines.length && lines[i].trim() === "}") i++;
      continue;
    }

    out.push(line);
    i++;
  }

  return { code: out.join("\n"), fixed };
}

/** Run orphan removal in a loop, then strip stray closing braces postcss rejects. */
export function repairCssFully(code: string): { code: string; notes: string[] } {
  const notes: string[] = [];
  let current = code;

  for (let pass = 0; pass < 12; pass++) {
    const { code: next, fixed } = repairCssOrphans(current);
    if (!fixed) break;
    notes.push("Removed orphaned CSS declarations");
    current = next;
  }

  for (let attempt = 0; attempt < 24; attempt++) {
    try {
      postcss.parse(current, { from: "app/globals.css" });
      return { code: current, notes };
    } catch (err) {
      const e = err as { line?: number; reason?: string };
      const lines = current.split("\n");
      let removed = false;

      if (e.line && e.line >= 1 && e.line <= lines.length) {
        const idx = e.line - 1;
        if (lines[idx].trim() === "}") {
          lines.splice(idx, 1);
          notes.push(`Removed stray "}" near line ${e.line}`);
          removed = true;
        }
      }

      if (!removed && e.reason?.includes("Unexpected }")) {
        const idx = lines.findIndex((l) => l.trim() === "}");
        if (idx >= 0) {
          lines.splice(idx, 1);
          notes.push("Removed stray closing brace");
          removed = true;
        }
      }

      if (!removed) break;
      current = lines.join("\n");
    }
  }

  return { code: current, notes };
}

/**
 * Strip markdown code fences and leading LLM prose ("Here is the updated
 * file:") that sometimes leak into saved file content.
 */
export function stripCodeFences(code: string): { code: string; fixed: boolean } {
  let current = code;
  let fixed = false;

  const fenced = current.match(/^\s*(?:[^\n]*\n)?```[a-z]*\n([\s\S]*?)\n```\s*$/);
  if (fenced) {
    current = fenced[1];
    fixed = true;
  } else if (/^\s*```/.test(current)) {
    current = current.replace(/^\s*```[a-z]*\n?/, "").replace(/\n?```\s*$/, "");
    fixed = true;
  }

  return { code: current, fixed };
}

function unbalancedDelimiters(code: string, path: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.ESNext,
    /* skipTrivia */ true,
    path.endsWith(".tsx") ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    code
  );

  const stack: string[] = [];
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.OpenBraceToken) stack.push("}");
    else if (token === ts.SyntaxKind.OpenParenToken) stack.push(")");
    else if (token === ts.SyntaxKind.OpenBracketToken) stack.push("]");
    else if (
      token === ts.SyntaxKind.CloseBraceToken ||
      token === ts.SyntaxKind.CloseParenToken ||
      token === ts.SyntaxKind.CloseBracketToken
    ) {
      const expected =
        token === ts.SyntaxKind.CloseBraceToken ? "}" : token === ts.SyntaxKind.CloseParenToken ? ")" : "]";
      if (stack[stack.length - 1] === expected) stack.pop();
    }
    token = scanner.scan();
  }

  return stack.reverse().join("\n");
}

/**
 * Repair truncated/corrupted TypeScript or TSX: strip markdown fences and
 * close delimiters left open by a truncated LLM response. Returns the
 * original code unchanged when no safe repair applies.
 */
export function repairTsFully(code: string, path: string): { code: string; notes: string[] } {
  const notes: string[] = [];

  const isValid = (c: string) => validateAppFiles([{ path, code: c }]).length === 0;
  if (isValid(code)) return { code, notes };

  let current = code;
  const { code: unfenced, fixed } = stripCodeFences(current);
  if (fixed) {
    current = unfenced;
    notes.push("Removed markdown code fences");
    if (isValid(current)) return { code: current, notes };
  }

  const closers = unbalancedDelimiters(current, path);
  if (closers) {
    const closed = `${current.replace(/\s+$/, "")}\n${closers}\n`;
    if (isValid(closed)) {
      notes.push("Closed unterminated braces/parens from a truncated edit");
      return { code: closed, notes };
    }
  }

  // No safe repair found — return best effort (fence stripping only)
  return { code: current, notes };
}

/** Repair invalid JSON: strip fences, trailing commas, and JS-style comments. */
export function repairJsonFully(code: string): { code: string; notes: string[] } {
  const notes: string[] = [];

  const isValid = (c: string) => {
    try {
      JSON.parse(c);
      return true;
    } catch {
      return false;
    }
  };
  if (isValid(code)) return { code, notes };

  let current = code;

  const { code: unfenced, fixed } = stripCodeFences(current);
  if (fixed) {
    current = unfenced;
    notes.push("Removed markdown code fences");
    if (isValid(current)) return { code: current, notes };
  }

  const noComments = current.replace(/^\s*\/\/[^\n]*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (noComments !== current && isValid(noComments)) {
    notes.push("Removed JS-style comments from JSON");
    return { code: noComments, notes };
  }

  const noTrailingCommas = current.replace(/,(\s*[}\]])/g, "$1");
  if (noTrailingCommas !== current && isValid(noTrailingCommas)) {
    notes.push("Removed trailing commas from JSON");
    return { code: noTrailingCommas, notes };
  }

  const both = noComments.replace(/,(\s*[}\]])/g, "$1");
  if (both !== current && isValid(both)) {
    notes.push("Removed comments and trailing commas from JSON");
    return { code: both, notes };
  }

  return { code: current, notes };
}

export function repairAppFiles(
  files: { path: string; code: string }[]
): { files: { path: string; code: string }[]; notes: string[] } {
  const notes: string[] = [];

  const repaired = files.map((f) => {
    if (f.path.endsWith(".css")) {
      const { code: stripped, notes: cssNotes } = repairCssFully(f.code);
      notes.push(...cssNotes.map((n) => `${f.path}: ${n}`));

      const problems = validateAppFiles([{ path: f.path, code: stripped }]);
      if (problems.length === 0) {
        return { ...f, code: stripped };
      }

      if (f.path === "app/globals.css") {
        notes.push(
          `Replaced broken ${f.path} with the default stylesheet — re-apply styling via the agent`
        );
        return { ...f, code: defaultGlobalsCss() };
      }

      return { ...f, code: stripped };
    }

    if (/\.(ts|tsx)$/.test(f.path)) {
      const { code, notes: tsNotes } = repairTsFully(f.code, f.path);
      notes.push(...tsNotes.map((n) => `${f.path}: ${n}`));
      return code === f.code ? f : { ...f, code };
    }

    if (f.path.endsWith(".json")) {
      const { code, notes: jsonNotes } = repairJsonFully(f.code);
      notes.push(...jsonNotes.map((n) => `${f.path}: ${n}`));
      return code === f.code ? f : { ...f, code };
    }

    return f;
  });

  return { files: repaired, notes };
}

/** Repair a saved/edited app blueprint before any edit or deploy operation. */
export function repairBlueprint(
  blueprint: AgentAppBlueprint
): { blueprint: AgentAppBlueprint; notes: string[] } {
  const { files, notes } = repairAppFiles(
    blueprint.files.map((f) => ({ path: f.path, code: f.code }))
  );
  const byPath = new Map(files.map((f) => [f.path, f.code]));
  return {
    notes,
    blueprint: {
      ...blueprint,
      files: blueprint.files.map((f) => ({
        ...f,
        code: byPath.get(f.path) ?? f.code,
      })),
    },
  };
}
