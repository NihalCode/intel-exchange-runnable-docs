import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import cases from "../../../scripts/chat-accuracy/cases/response-quality-suite.json";
import { runAgent } from "../agent/orchestrate";
import { fabricationRefusal, secretDisclosureRefusal } from "../agent/safety";

/**
 * Strict chat/snippet/readability testing matrix (Phases 3, 4, 6, 7, 8, 9, 16
 * of the strict testing prompt). Mirrors the `ResponseQualityTest` shape —
 * see scripts/chat-accuracy/response-quality-types.mjs.
 *
 * Deterministic by design: OPENAI_API_KEY is unset in CI/local test runs, so
 * every assertion here holds for the rule-based fallback planner exercised in
 * this environment. `responseStyle` (snippet gating, mode, readability
 * limits) is computed before any LLM call and governs the same way in
 * production, so those assertions hold there too.
 */

type ResponseQualityFixture = {
  id: string;
  category: string;
  product?: string;
  prompt: string;
  selectedProduct: string;
  allowedProductIds?: string[];
  expected: {
    responseMode: string;
    snippetExpected: boolean;
    snippetLanguage?: string;
    maxWords?: number;
    maxParagraphs?: number;
    mustContain?: string[];
    mustNotContain?: string[];
    sideEffectExpected: boolean;
    refusal?: "fabrication" | "secret";
  };
};

type CaseResult = {
  id: string;
  category: string;
  status: "passed" | "failed";
  summary: string;
};

const fixtures = cases as ResponseQualityFixture[];
const results: CaseResult[] = [];

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "chat-accuracy");
const REPORT_PATH = path.join(ARTIFACT_DIR, "response-quality-report.json");

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function paragraphCount(text: string): number {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean).length;
}

describe("strict response-quality matrix (chat/snippet/readability)", () => {
  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      try {
        const response = await runAgent({
          query: fixture.prompt,
          productId: fixture.selectedProduct,
          allowedProductIds: fixture.allowedProductIds,
        });

        if (fixture.expected.refusal === "fabrication") {
          expect(response.workflow).toBe(fabricationRefusal());
          expect(response.steps).toEqual([]);
        } else if (fixture.expected.refusal === "secret") {
          expect(response.workflow).toBe(secretDisclosureRefusal());
          expect(response.code).toBe("SECRET_DISCLOSURE_REFUSED");
        } else {
          const style = response.responseStyle;
          expect(style, `responseStyle missing for "${fixture.prompt}"`).toBeDefined();
          expect(style?.mode).toBe(fixture.expected.responseMode);

          // Snippet compliance (Phase 3 / Phase 4): a script attachment or a
          // fenced code block in the prose both count as "a snippet was
          // returned" — the UI can render either.
          const hasCodeFence = /```/.test(response.workflow);
          const hasScripts = (response.scripts?.length ?? 0) > 0;
          const gotSnippet = hasCodeFence || hasScripts;
          expect(
            gotSnippet,
            `expected snippetExpected=${fixture.expected.snippetExpected} for "${fixture.prompt}" but scripts=${response.scripts?.length ?? 0} codeFence=${hasCodeFence}`
          ).toBe(fixture.expected.snippetExpected);

          if (fixture.expected.snippetExpected && fixture.expected.snippetLanguage) {
            expect(style?.snippet.language).toBe(fixture.expected.snippetLanguage);
          }

          if (!fixture.expected.snippetExpected) {
            expect(response.workflow).not.toMatch(/```/);
          }

          const words = wordCount(response.workflow);
          if (fixture.expected.maxWords) {
            expect(
              words,
              `"${fixture.prompt}" produced ${words} words (limit ${fixture.expected.maxWords})`
            ).toBeLessThanOrEqual(fixture.expected.maxWords);
          }

          const paragraphs = paragraphCount(response.workflow);
          if (fixture.expected.maxParagraphs) {
            expect(
              paragraphs,
              `"${fixture.prompt}" produced ${paragraphs} paragraphs (limit ${fixture.expected.maxParagraphs})`
            ).toBeLessThanOrEqual(fixture.expected.maxParagraphs);
          }

          const haystack = [
            response.workflow,
            ...(response.citations ?? []).map((c) => c.slug),
          ]
            .join(" \n ")
            .toLowerCase();

          for (const term of fixture.expected.mustContain ?? []) {
            expect(haystack, `"${fixture.prompt}" missing required term "${term}"`).toContain(
              term.toLowerCase()
            );
          }
          for (const term of fixture.expected.mustNotContain ?? []) {
            expect(haystack, `"${fixture.prompt}" contains forbidden term "${term}"`).not.toContain(
              term.toLowerCase()
            );
          }

          // sideEffectExpected: the documentation agent never performs a live
          // mutating call itself — verify no response claims to have done so.
          if (!fixture.expected.sideEffectExpected) {
            expect(haystack).not.toMatch(/\b(?:deleted successfully|request sent|i have executed|executed successfully)\b/);
          }
        }

        results.push({
          id: fixture.id,
          category: fixture.category,
          status: "passed",
          summary: `mode=${response.responseStyle?.mode ?? "n/a"} scripts=${response.scripts?.length ?? 0}`,
        });
      } catch (error) {
        results.push({
          id: fixture.id,
          category: fixture.category,
          status: "failed",
          summary: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }
});

afterAll(() => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const passed = results.filter((r) => r.status === "passed").length;
  writeFileSync(
    REPORT_PATH,
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        caseCount: results.length,
        passed,
        failed: results.length - passed,
        results,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
});
