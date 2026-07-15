/**
 * Typed test-matrix format for the strict chat/snippet/readability/support
 * testing pass (see docs/enterprise/STRICT_CHAT_SNIPPET_READABILITY_SUPPORT_TESTING_REPORT.md).
 * This mirrors the `ResponseQualityTest` shape from the strict testing prompt.
 * JSDoc only (no runtime import) — the Vitest suites re-declare a matching
 * TypeScript type so `tsc` can check fixtures at compile time.
 *
 * @typedef {"chat_accuracy"|"snippet_accuracy"|"readability"|"support_accuracy"|"routing"|"context"|"citation"|"accessibility"} ResponseQualityCategory
 * @typedef {"CTIX"|"CFTR"|"CSAP"|"Orchestrate"} ProductName
 * @typedef {"quick"|"standard"|"detailed"|"snippet"|"troubleshooting"|"comparison"|"clarification"|"conceptual"} ResponseMode
 *
 * @typedef {object} ResponseQualityExpected
 * @property {string} intent
 * @property {string[]} effectiveProducts
 * @property {string=} provider
 * @property {{expected: boolean, language?: string}} snippet
 * @property {ResponseMode} responseMode
 * @property {number=} maxRecommendedWords
 * @property {number=} maxRecommendedSections
 * @property {string[]=} mustContain
 * @property {string[]=} mustNotContain
 * @property {string[]=} requiredSources
 * @property {string[]=} forbiddenTools
 * @property {boolean} sideEffectExpected
 *
 * @typedef {object} ResponseQualityTest
 * @property {string} id
 * @property {ResponseQualityCategory} category
 * @property {ProductName=} product
 * @property {string} prompt
 * @property {string=} selectedProduct
 * @property {Array<{role: "user"|"assistant", content: string}>=} history
 * @property {ResponseQualityExpected} expected
 */

export {};
