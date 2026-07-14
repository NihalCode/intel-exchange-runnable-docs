import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import cases from "../../../scripts/chat-accuracy/cases/demo-critical.json";
import ctixIndex from "../../content/agent-index.json";
import csapIndex from "../../content/products/csap/agent-index.json";
import cftrIndex from "../../content/products/cftr/agent-index.json";
import orchestrateIndex from "../../content/products/orchestrate/agent-index.json";
import { evidenceLabel } from "../agent/answer-ux";
import { resolveAgentIntent } from "../agent/intent";
import { runAgent } from "../agent/orchestrate";
import { resolveProductScope } from "../agent/product-scope";
import { retrieveLexical, evidenceFromScores } from "../agent/retrieve";
import { fabricationRefusal, supportSearchUnavailable } from "../agent/safety";
import type { AgentIndex } from "../agent/types";
import { defaultDocumentationFeatureEnabled } from "../documentation-features/keys";

type ChatTestCase = {
  id: string;
  prompt: string;
  expectedIntent: "workflow" | "snippet" | "app_build" | "app_edit" | "explain";
  expectedProducts: string[];
  expectedSlug?: string;
  retrievalSlug?: string;
  rankExpected?: boolean;
  mustContain?: string[];
  mustNotContain?: string[];
  responseType?: "plan" | "gated_unavailable" | "refusal" | "abstention";
  hasProjectFiles?: boolean;
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
const testCases = cases as ChatTestCase[];
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
        expect(intent.intent).toBe(fixture.expectedIntent);
        if (fixture.hasProjectFiles && fixture.expectedIntent === "workflow") {
          expect(intent.editExistingApp).toBe(false);
        }

        const scope = resolveProductScope(
          {
            query: fixture.prompt,
            productId: fixture.expectedProducts.length === 4 ? "all" : fixture.expectedProducts[0],
          },
          fixture.prompt
        );
        expect(scope.productIds).toEqual(fixture.expectedProducts);

        let evidence: string | undefined;
        if (fixture.expectedSlug) {
          expect(
            manifest.entries.some(
              (entry) =>
                entry.productId === fixture.expectedProducts[0] &&
                entry.slug === fixture.expectedSlug &&
                entry.kind === "endpoint"
            )
          ).toBe(true);

          const retrieved = retrieveLexical(fixture.prompt, INDEXES[fixture.expectedProducts[0]!]!, 30);
          if (fixture.rankExpected !== false) {
            expect(
              retrieved.some((entry) => entry.slug === (fixture.retrievalSlug ?? fixture.expectedSlug))
            ).toBe(true);
          } else {
            expect(retrieved.some((entry) => entry.kind === "endpoint")).toBe(true);
          }
          evidence = evidenceLabel(evidenceFromScores(retrieved));

          const retrievedText = retrieved.map((entry) => entry.text).join(" ").toLowerCase();
          for (const term of fixture.mustContain ?? []) {
            expect(retrievedText).toContain(term.toLowerCase());
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
