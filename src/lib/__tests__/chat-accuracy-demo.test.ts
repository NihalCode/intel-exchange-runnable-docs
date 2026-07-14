import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import cases from "../../../scripts/chat-accuracy/cases/demo-critical.json";
import ctixSuite from "../../../scripts/chat-accuracy/cases/ctix-suite.json";
import cftrSuite from "../../../scripts/chat-accuracy/cases/cftr-suite.json";
import csapSuite from "../../../scripts/chat-accuracy/cases/csap-suite.json";
import orchestrateSuite from "../../../scripts/chat-accuracy/cases/orchestrate-suite.json";
import intentCollisionSuite from "../../../scripts/chat-accuracy/cases/intent-collision-suite.json";
import securitySuite from "../../../scripts/chat-accuracy/cases/security-suite.json";
import ctixIndex from "../../content/agent-index.json";
import csapIndex from "../../content/products/csap/agent-index.json";
import cftrIndex from "../../content/products/cftr/agent-index.json";
import orchestrateIndex from "../../content/products/orchestrate/agent-index.json";
import { evidenceLabel } from "../agent/answer-ux";
import { resolveAgentIntent } from "../agent/intent";
import { runAgent } from "../agent/orchestrate";
import { resolveProductScope } from "../agent/product-scope";
import { retrieveLexical, evidenceFromScores } from "../agent/retrieve";
import {
  dangerousSideEffectRefusal,
  fabricationRefusal,
  secretDisclosureRefusal,
  supportSearchUnavailable,
} from "../agent/safety";
import type { AgentIndex } from "../agent/types";
import { defaultDocumentationFeatureEnabled } from "../documentation-features/keys";

type ChatTestCase = {
  id: string;
  prompt: string;
  expectedIntent:
    | "workflow"
    | "snippet"
    | "app_build"
    | "app_edit"
    | "explain"
    | "deploy"
    | "commit"
    | "preview";
  fallbackIntent?: Array<
    "workflow" | "snippet" | "app_build" | "app_edit" | "explain" | "deploy" | "commit" | "preview"
  >;
  expectedProducts: string[];
  productSelector?: string;
  expectedSlug?: string;
  retrievalSlug?: string;
  rankExpected?: boolean;
  mustContain?: string[];
  mustNotContain?: string[];
  responseType?:
    | "plan"
    | "gated_unavailable"
    | "refusal"
    | "secret_refusal"
    | "side_effect_refusal"
    | "abstention"
    | "abstention_or_no_invent";
  hasProjectFiles?: boolean;
  conversationHistory?: Array<{ role: string; content: string }>;
};

type CaseResult = {
  id: string;
  status: "passed" | "failed";
  summary: string;
  evidence?: string;
};

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "chat-accuracy");
const MANIFEST_PATH = path.join(ARTIFACT_DIR, "api-manifest.json");
const REPORT_PATH = path.join(ARTIFACT_DIR, "demo-critical-report.json");
const MARKDOWN_PATH = path.join(ARTIFACT_DIR, "DEMO_REPORT.md");
const testCases = [
  ...(cases as ChatTestCase[]),
  ...(ctixSuite as ChatTestCase[]),
  ...(cftrSuite as ChatTestCase[]),
  ...(csapSuite as ChatTestCase[]),
  ...(orchestrateSuite as ChatTestCase[]),
  ...(intentCollisionSuite as ChatTestCase[]),
  ...(securitySuite as ChatTestCase[]),
];
const caseResults: CaseResult[] = [];

const INDEXES: Record<string, AgentIndex> = {
  ctix: ctixIndex as unknown as AgentIndex,
  csap: csapIndex as unknown as AgentIndex,
  cftr: cftrIndex as unknown as AgentIndex,
  orchestrate: orchestrateIndex as unknown as AgentIndex,
};

function buildManifest() {
  execFileSync(process.execPath, ["scripts/chat-accuracy/build-api-manifest.mjs"], {
    cwd: ROOT,
    stdio: "pipe",
  });
}

function readManifest(): { entries: { productId: string; slug: string; kind: string }[] } {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    entries: { productId: string; slug: string; kind: string }[];
  };
}

function reportMarkdown(results: CaseResult[], generatedAt: string): string {
  const passed = results.filter((result) => result.status === "passed").length;
  return [
    "# Demo-critical chat accuracy report",
    "",
    `Generated: ${generatedAt}`,
    `Cases: ${results.length}`,
    `Passed: ${passed}`,
    `Failed: ${results.length - passed}`,
    "",
    "## Cases",
    ...results.map(
      (result) =>
        `- ${result.status === "passed" ? "PASS" : "FAIL"} \`${result.id}\`: ${result.summary}`
    ),
    "",
  ].join("\n");
}

describe("demo-critical chat accuracy harness", () => {
  buildManifest();
  const manifest = readManifest();

  it("keeps every supported product represented in the generated manifest", () => {
    expect(manifest.entries.filter((entry) => entry.productId === "ctix")).not.toHaveLength(0);
    expect(manifest.entries.filter((entry) => entry.productId === "cftr")).not.toHaveLength(0);
    expect(manifest.entries.filter((entry) => entry.productId === "csap")).not.toHaveLength(0);
    expect(manifest.entries.filter((entry) => entry.productId === "orchestrate")).not.toHaveLength(0);
  });

  for (const fixture of testCases) {
    it(fixture.id, async () => {
      try {
        const intent = resolveAgentIntent(fixture.prompt, {
          hasProjectFiles: fixture.hasProjectFiles ?? false,
        });
        const allowedIntents = new Set<string>([
          fixture.expectedIntent,
          ...(fixture.fallbackIntent ?? []),
        ]);
        expect(allowedIntents.has(intent.intent)).toBe(true);
        if (fixture.hasProjectFiles && allowedIntents.has("workflow")) {
          expect(intent.editExistingApp).toBe(false);
          expect(intent.intent).not.toBe("app_edit");
        }
        for (const banned of fixture.mustNotContain ?? []) {
          if (banned === "app_edit") {
            expect(intent.intent).not.toBe("app_edit");
          }
        }

        const scope = resolveProductScope(
          {
            query: fixture.prompt,
            productId:
              fixture.productSelector ??
              (fixture.expectedProducts.length > 1 ? "all" : fixture.expectedProducts[0]),
          },
          fixture.prompt
        );
        expect(scope.productIds).toEqual(fixture.expectedProducts);

        let evidence: string | undefined;
        const primaryProduct = fixture.expectedProducts[0]!;
        const index = INDEXES[primaryProduct];
        if (index && (fixture.expectedSlug || fixture.mustContain?.length)) {
          if (fixture.expectedSlug) {
            expect(
              manifest.entries.some(
                (entry) =>
                  entry.productId === primaryProduct &&
                  entry.slug === fixture.expectedSlug &&
                  entry.kind === "endpoint"
              )
            ).toBe(true);
          }

          const retrieved = retrieveLexical(fixture.prompt, index, 30);
          if (fixture.expectedSlug) {
            if (fixture.rankExpected !== false) {
              expect(
                retrieved.some(
                  (entry) => entry.slug === (fixture.retrievalSlug ?? fixture.expectedSlug)
                )
              ).toBe(true);
            } else {
              expect(retrieved.some((entry) => entry.kind === "endpoint")).toBe(true);
            }
            evidence = evidenceLabel(evidenceFromScores(retrieved));
          }

          if (fixture.mustContain?.length) {
            const retrievedText = retrieved.map((entry) => entry.text).join(" ").toLowerCase();
            // Query nouns (phishing, 401) may not appear in BM25 hits — only enforce
            // terms when we also named a canonical expectedSlug for the product.
            if (fixture.expectedSlug) {
              for (const term of fixture.mustContain) {
                expect(retrievedText).toContain(term.toLowerCase());
              }
            } else {
              expect(retrieved.some((entry) => entry.kind === "endpoint" || entry.kind === "section")).toBe(
                true
              );
              const hitAny = fixture.mustContain.some((term) =>
                retrievedText.includes(term.toLowerCase())
              );
              expect(hitAny).toBe(true);
            }
          }
        }

        if (fixture.responseType === "abstention") {
          const response = await runAgent({
            query: fixture.prompt,
            productId: "all",
            allowedProductIds: fixture.expectedProducts,
          });
          expect(response.steps).toEqual([]);
          expect(response.workflow).toMatch(/which cyware product/i);
        }

        if (fixture.responseType === "abstention_or_no_invent") {
          const response = await runAgent({
            query: fixture.prompt,
            productId: primaryProduct,
            allowedProductIds: fixture.expectedProducts,
          });
          const body = `${response.workflow}\n${JSON.stringify(response.steps)}`.toLowerCase();
          expect(body).not.toMatch(/delete\s+\/indicators\/all/);
          for (const banned of fixture.mustNotContain ?? []) {
            expect(body).not.toContain(banned.toLowerCase());
          }
        }

        if (fixture.responseType === "gated_unavailable") {
          expect(defaultDocumentationFeatureEnabled("support_agent")).toBe(false);
          const response = await runAgent({ query: fixture.prompt, productId: "ctix" });
          expect(response.code).toBe("SUPPORT_AGENT_UNAVAILABLE");
          expect(response.workflow).toBe(supportSearchUnavailable());
        }

        if (fixture.responseType === "refusal") {
          const response = await runAgent({ query: fixture.prompt, productId: "ctix" });
          expect(response.workflow).toBe(fabricationRefusal());
          expect(response.steps).toEqual([]);
        }

        if (fixture.responseType === "secret_refusal") {
          const response = await runAgent({ query: fixture.prompt, productId: "ctix" });
          expect(response.workflow).toBe(secretDisclosureRefusal());
          expect(response.code).toBe("SECRET_DISCLOSURE_REFUSED");
          expect(response.steps).toEqual([]);
        }

        if (fixture.responseType === "side_effect_refusal") {
          const response = await runAgent({ query: fixture.prompt, productId: "ctix" });
          expect(response.workflow).toBe(dangerousSideEffectRefusal());
          expect(response.code).toBe("SIDE_EFFECT_REFUSED");
          expect(response.steps).toEqual([]);
        }

        caseResults.push({
          id: fixture.id,
          status: "passed",
          summary: `${intent.intent}; ${fixture.expectedProducts.join(", ")}${evidence ? `; ${evidence}` : ""}`,
          evidence,
        });
      } catch (error) {
        caseResults.push({
          id: fixture.id,
          status: "failed",
          summary: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }
});

afterAll(() => {
  const generatedAt = new Date().toISOString();
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(
    REPORT_PATH,
    `${JSON.stringify({ version: 1, generatedAt, caseCount: testCases.length, results: caseResults }, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(MARKDOWN_PATH, reportMarkdown(caseResults, generatedAt), "utf8");
});
