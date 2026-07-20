import postcss from "postcss";
import ts from "typescript";

import { detectDangerousAppCode } from "@/lib/agent/generated-code-policy";

export interface AppFileProblem {
  path: string;
  error: string;
}

/**
 * Syntax-validate app files before saving an edit or deploying.
 * Catches truncated/corrupted TS/TSX (the main cause of "npm run build exited
 * with 1" on generated apps) and invalid JSON. Type errors are intentionally
 * not checked — generated apps skip type-checking at build time.
 */
export function validateAppFiles(
  files: { path: string; code: string }[]
): AppFileProblem[] {
  const problems: AppFileProblem[] = [];

  for (const f of files) {
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f.path)) {
      const dangerous = detectDangerousAppCode(f.code);
      if (dangerous) {
        problems.push({ path: f.path, error: dangerous });
      }
    }
    if (/\.(ts|tsx)$/.test(f.path)) {
      const out = ts.transpileModule(f.code, {
        compilerOptions: {
          jsx: ts.JsxEmit.Preserve,
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
        },
        reportDiagnostics: true,
        fileName: f.path,
      });
      const syntaxErrors = (out.diagnostics ?? []).filter(
        (d) => d.category === ts.DiagnosticCategory.Error
      );
      if (syntaxErrors.length > 0) {
        const d = syntaxErrors[0];
        const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
        let loc = "";
        if (d.file && d.start !== undefined) {
          const { line } = d.file.getLineAndCharacterOfPosition(d.start);
          loc = ` (line ${line + 1})`;
        }
        problems.push({ path: f.path, error: `${msg}${loc}` });
      }
    } else if (f.path.endsWith(".json")) {
      try {
        JSON.parse(f.code);
      } catch {
        problems.push({ path: f.path, error: "invalid JSON" });
      }
    } else if (f.path.endsWith(".css")) {
      try {
        postcss.parse(f.code, { from: f.path });
      } catch (err) {
        const e = err as { reason?: string; line?: number };
        problems.push({
          path: f.path,
          error: `CSS syntax error: ${e.reason ?? "parse failed"}${e.line ? ` (line ${e.line})` : ""}`,
        });
      }
    }
  }

  return problems;
}

export { detectDangerousAppCode } from "@/lib/agent/generated-code-policy";

export function formatProblems(problems: AppFileProblem[]): string {
  return problems
    .slice(0, 3)
    .map((p) => `${p.path}: ${p.error}`)
    .join("; ");
}
