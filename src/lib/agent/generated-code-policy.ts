/**
 * Policy detector for generated agent apps — rejects dangerous patterns.
 * This module does NOT execute code; it only inspects source text.
 */

export type GeneratedCodeViolationRule =
  | "global_eval_call"
  | "function_constructor"
  | "process_execution"
  | "privileged_env_read";

export type GeneratedCodeViolation = {
  rule: GeneratedCodeViolationRule;
  message: string;
};

/**
 * Detect executable-dangerous patterns in generated app source.
 * Uses word-boundary regexes so names like `retrieval` / `evaluation` are not flagged.
 */
export function detectGeneratedCodeViolations(code: string): GeneratedCodeViolation[] {
  const violations: GeneratedCodeViolation[] = [];

  if (/\beval\s*\(/.test(code)) {
    violations.push({
      rule: "global_eval_call",
      message: "eval() is not allowed in generated apps",
    });
  }
  if (/\bnew\s+Function\s*\(/.test(code) || /\bFunction\s*\(\s*['"`]/.test(code)) {
    violations.push({
      rule: "function_constructor",
      message: "Function constructor is not allowed in generated apps",
    });
  }
  if (/\b(?:require\s*\(\s*['"]child_process['"]|from\s+['"](?:node:)?child_process['"])/.test(code)) {
    violations.push({
      rule: "process_execution",
      message: "child_process is not allowed in generated apps",
    });
  }
  if (/process\.env\.(AUTH0_|DATABASE_URL|OPENAI_|PINECONE_|VERCEL_TOKEN|SECRET)/i.test(code)) {
    violations.push({
      rule: "privileged_env_read",
      message: "reading privileged process.env secrets is not allowed in generated apps",
    });
  }

  return violations;
}

/** Convenience: first violation message or null (preserves prior validate-app API). */
export function detectDangerousAppCode(code: string): string | null {
  return detectGeneratedCodeViolations(code)[0]?.message ?? null;
}
