import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import cases from "../../../scripts/chat-accuracy/cases/build-app-suite.json";
import { generateAppBlueprint } from "../agent/app-builder";
import { buildStepSpec } from "../agent/spec";
import { resolveAgentIntent } from "../agent/intent";
import { validateAppFiles } from "../agent/validate-app";
import type { AgentStepResult } from "../agent/types";

type BuildAppCase = {
  id: string;
  product: "ctix" | "cftr" | "csap" | "orchestrate";
  prompt: string;
  expectedIntent: "build_app" | "edit_app" | "explain_only" | "snippet";
  expectedProductScope: string[];
  buildMustSucceed: boolean;
  forbiddenFiles: string[];
};

type CaseResult = { id: string; status: "passed" | "failed"; summary: string };

const fixtures = cases as BuildAppCase[];
const results: CaseResult[] = [];
const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "chat-accuracy");
const REPORT_PATH = path.join(ARTIFACT_DIR, "build-app-report.json");
const PRODUCTS = ["ctix", "cftr", "csap", "orchestrate"] as const;

const INTENT_MAP: Record<BuildAppCase["expectedIntent"], string[]> = {
  build_app: ["app_build"],
  edit_app: ["app_edit", "workflow", "explain"],
  explain_only: ["explain"],
  snippet: ["snippet", "workflow"],
};

/** Real documented connectivity endpoints only — never invent paths. */
function sampleStep(product: string): AgentStepResult {
  const pathByProduct: Record<string, { slug: string; apiPath: string }> = {
    ctix: { slug: "ping/ping", apiPath: "/ping/" },
    cftr: {
      slug: "cftr-api-reference/authentication/test-connectivity",
      apiPath: "/cftrapi/openapi/test-connectivity/",
    },
    csap: {
      slug: "analyst-portal/authentication/test-connectivity",
      apiPath: "/csap/v1/test_connectivity/",
    },
    orchestrate: {
      slug: "authentication/test-connectivity",
      apiPath: "/v1/test_connectivity/",
    },
  };
  const meta = pathByProduct[product] ?? pathByProduct.ctix!;
  const page = {
    slug: meta.slug,
    title: "Test connectivity",
    kind: "endpoint" as const,
    breadcrumb: [],
    description: "",
    method: "GET" as const,
    path: meta.apiPath,
    request: { query: [], header: [], body: [], path: [] },
    responses: [],
  };
  return {
    order: 1,
    slug: meta.slug,
    title: "Test connectivity",
    method: "GET",
    path: meta.apiPath,
    explanation: "connectivity",
    docUrl: `/docs/${meta.slug}`,
    warnings: [],
    params: {},
    code: "",
    request: { method: "GET", path: meta.apiPath, query: [], headers: [] },
    meta: {},
    spec: buildStepSpec(page, { method: "GET", path: meta.apiPath, query: [], headers: [] }, "https://tenant.example.com"),
  };
}

describe("production Build App harness", () => {
  it("has ≥30 safe ProductionBuildAppCase fixtures per product", () => {
    for (const product of PRODUCTS) {
      const count = fixtures.filter((f) => f.product === product).length;
      expect(count, `${product} build-app cases`).toBeGreaterThanOrEqual(30);
    }
    expect(fixtures.length).toBeGreaterThanOrEqual(120);
  });

  for (const fixture of fixtures) {
    it(fixture.id, () => {
      try {
        const intent = resolveAgentIntent(fixture.prompt, {
          hasProjectFiles: fixture.expectedIntent === "edit_app",
        });
        expect(INTENT_MAP[fixture.expectedIntent]).toContain(intent.intent);

        // Intent collision: explain must never route to app_build
        if (fixture.expectedIntent === "explain_only") {
          expect(intent.intent).toBe("explain");
          expect(intent.intent).not.toBe("app_build");
        }

        if (fixture.buildMustSucceed) {
          const step = sampleStep(fixture.product);
          const app = generateAppBlueprint(
            fixture.prompt,
            `${fixture.product} demo app`,
            "harness",
            [step]
          );
          expect(app.files.length).toBeGreaterThan(0);
          expect(app.files.some((f) => f.path === "package.json")).toBe(true);

          const routeFiles = app.files.filter((f) => f.path.startsWith("app/api/cyware/"));
          expect(routeFiles.length).toBeGreaterThan(0);
          const routeBlob = routeFiles.map((f) => f.code).join("\n");
          expect(routeBlob).toContain(step.path);

          for (const file of app.files) {
            expect(file.path.includes("..")).toBe(false);
            expect(file.path.startsWith("/")).toBe(false);
            expect(file.code).not.toMatch(/SecretKey\s*=/);
            expect(file.code).not.toMatch(/process\.env\.(AUTH0_|DATABASE_URL|OPENAI_)/);
          }
          for (const forbidden of fixture.forbiddenFiles) {
            expect(app.files.some((f) => f.path === forbidden || f.path.endsWith(`/${forbidden}`))).toBe(
              false
            );
          }
          const problems = validateAppFiles(app.files);
          expect(problems).toEqual([]);
        }

        results.push({ id: fixture.id, status: "passed", summary: "ok" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ id: fixture.id, status: "failed", summary: message });
        throw error;
      }
    });
  }
});

afterAll(() => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(
    REPORT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
    "utf8"
  );
});
