/**
 * Intentional security-test fixtures. Strings only — never executed.
 * Kept out of production modules so external scanners classify as test fixtures.
 */

export const DANGEROUS_CODE_SAMPLES = {
  directEvalCall: "eval(userCode)",
  functionConstructor: "new Function(userCode)",
  functionCallConstructor: "Function('return 1')",
  childProcessRequire: "require('child_process')",
  privilegedEnv: "process.env.OPENAI_API_KEY",
} as const;

/** Safe identifiers that must NOT be mistaken for eval / Function constructor. */
export const SAFE_IDENTIFIER_SAMPLES = {
  expandQueryForRetrieval: "export function expandQueryForRetrieval(q: string) { return q; }",
  planAppFromRetrieval: "export function planAppFromRetrieval() { return null; }",
  retrievalQuery: "const retrievalQuery = 'tags';",
  normalFunction: "function normalFunction() { return 1; }",
} as const;
