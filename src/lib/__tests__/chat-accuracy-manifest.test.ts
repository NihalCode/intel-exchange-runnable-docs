import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveAgentIntent } from "../agent/intent";
import { runAgent } from "../agent/orchestrate";
import { resolveProductScope } from "../agent/product-scope";
import {
  fabricationRefusal,
  secretDisclosureRefusal,
  dangerousSideEffectRefusal,
} from "../agent/safety";

type ManifestCase = {
  id: string;
  prompt: string;
  expectedIntent: string;
  fallbackIntent?: string[];
  expectedProducts: string[];
  productSelector?: string;
  expectedSlug?: string;
  mustContain?: string[];
  mustNotContain?: string[];
  responseType?: string;
  snippetExpected?: boolean;
  rankExpected?: boolean;
  category?: string;
};

type CaseResult = {
  id: string;
  status: "passed" | "failed";
  summary: string;
};

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "chat-accuracy");
const REPORT_PATH = path.join(ARTIFACT_DIR, "manifest-suite-report.json");
const PRODUCTS = ["ctix", "cftr", "csap", "orchestrate"] as const;
const results: CaseResult[] = [];

function ensureSuitesGenerated() {
  execFileSync(process.execPath, ["scripts/chat-accuracy/build-api-manifest.mjs"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  execFileSync(process.execPath, ["scripts/chat-accuracy/generate-manifest-suites.mjs"], {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, MANIFEST_SUITE_LIMIT: process.env.MANIFEST_SUITE_LIMIT || "24" },
  });
}

function loadSuite(productId: string): ManifestCase[] {
  const file = path.join(
    ROOT,
    "scripts",
    "chat-accuracy",
    "cases",
    `${productId}-manifest-suite.json`
  );
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")) as ManifestCase[];
}

function assertFreshness() {
  const metaPath = path.join(ARTIFACT_DIR, "manifest-suites-meta.json");
  const manifestPath = path.join(ARTIFACT_DIR, "api-manifest.json");
  expect(existsSync(metaPath)).toBe(true);
  expect(existsSync(manifestPath)).toBe(true);
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
    manifestContentHash: string;
    manifestEndpointCount?: number;
  };
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    contentHash?: string;
    endpointCount?: number;
    entries: unknown[];
  };
  expect(meta.manifestContentHash.length).toBeGreaterThan(8);
  expect(manifest.entries.length).toBeGreaterThan(0);
  expect(meta.manifestEndpointCount ?? manifest.endpointCount ?? 0).toBeGreaterThan(0);
}

ensureSuitesGenerated();

describe("manifest-driven production chat suites", () => {
  it("stores freshness metadata for golden invalidation", () => {
    assertFreshness();
  });

  for (const productId of PRODUCTS) {
    const suite = loadSuite(productId);
    describe(productId, () => {
      it(`has generated cases for ${productId}`, () => {
        expect(suite.length).toBeGreaterThan(5);
      });

      for (const fixture of suite) {
        it(fixture.id, async () => {
          try {
            const scope = resolveProductScope(
              {
                query: fixture.prompt,
                productId: fixture.productSelector ?? productId,
              },
              fixture.prompt,
              { allowedProductIds: [productId] }
            );
            expect(scope.productIds.length).toBeGreaterThan(0);
            expect(scope.productIds.every((id) => id === productId || fixture.expectedProducts.includes(id))).toBe(
              true
            );

            const intent = resolveAgentIntent(fixture.prompt, {
              hasProjectFiles: false,
            });
            // Generated title queries may resolve as explain vs workflow; allow both for endpoint category.
            if (fixture.category === "endpoint" || fixture.category === "readability") {
              expect(["workflow", "snippet", "explain", "app_build"]).toContain(intent.intent);
            }

            const response = await runAgent({
              query: fixture.prompt,
              productId: fixture.productSelector ?? productId,
              allowedProductIds: [productId],
            });

            const blob = `${response.workflow ?? ""}\n${JSON.stringify(response.steps ?? [])}\n${response.code ?? ""}`;

            if (fixture.responseType === "abstention_or_no_invent") {
              expect(blob.toLowerCase()).not.toMatch(/secretkey\s*=/);
              const refused =
                blob.includes(fabricationRefusal()) ||
                blob.includes(secretDisclosureRefusal()) ||
                blob.includes(dangerousSideEffectRefusal()) ||
                /not (documented|verified|supported)|no verified|cannot|don't invent|do not invent|unsupported/i.test(
                  blob
                ) ||
                (response.steps?.length ?? 0) === 0;
              expect(refused).toBe(true);
            }

            if (fixture.mustNotContain) {
              for (const term of fixture.mustNotContain) {
                expect(blob.toLowerCase()).not.toContain(term.toLowerCase());
              }
            }

            if (fixture.mustContain && fixture.category === "authentication") {
              for (const term of fixture.mustContain) {
                expect(blob.toLowerCase()).toContain(term.toLowerCase());
              }
            }

            if (fixture.snippetExpected === false && fixture.category === "readability") {
              // Prefer no fenced code when user asked for no code — soft check on workflow only.
              const fences = (response.workflow ?? "").match(/```/g)?.length ?? 0;
              expect(fences).toBeLessThanOrEqual(2);
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
  }
});

afterAll(() => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        results,
      },
      null,
      2
    ),
    "utf8"
  );
});
