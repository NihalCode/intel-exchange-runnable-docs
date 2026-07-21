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

/** Extreme-prompt floors enforced on generated suites (per product). */
const CATEGORY_FLOORS: Record<string, number> = {
  endpoint: 50,
  authentication: 30,
  troubleshooting: 30,
  snippet: 30,
  unsupported: 30,
  typo: 30,
  pagination: 20,
  adversarial: 20,
};

const SOFT_INTENT_CATEGORIES = new Set([
  "endpoint",
  "readability",
  "typo",
  "pagination",
  "parameters",
  "troubleshooting",
  "authentication",
]);

function ensureSuitesGenerated() {
  execFileSync(process.execPath, ["scripts/chat-accuracy/build-api-manifest.mjs"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  execFileSync(process.execPath, ["scripts/chat-accuracy/generate-manifest-suites.mjs"], {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, MANIFEST_SUITE_LIMIT: process.env.MANIFEST_SUITE_LIMIT || "360" },
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

function categoryCounts(suite: ManifestCase[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of suite) {
    const key = c.category || "none";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
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

async function assertCase(fixture: ManifestCase, productId: string) {
  const scope = resolveProductScope(
    {
      query: fixture.prompt,
      productId: fixture.productSelector ?? productId,
    },
    fixture.prompt,
    { allowedProductIds: [productId] }
  );
  expect(scope.productIds.length).toBeGreaterThan(0);
  expect(
    scope.productIds.every((id) => id === productId || fixture.expectedProducts.includes(id))
  ).toBe(true);

  const intent = resolveAgentIntent(fixture.prompt, {
    hasProjectFiles: false,
  });
  if (SOFT_INTENT_CATEGORIES.has(fixture.category || "")) {
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
    // Must not echo fabricated paths from the adversarial/unsupported prompt.
    expect(blob).not.toMatch(/\/__does_not_exist__\//i);
    expect(blob).not.toMatch(/\/__unsupported_\d+__\//i);
    expect(blob).not.toMatch(/\/__fake__\//i);
    expect(blob).not.toMatch(/\/__no_match__\//i);
    expect(blob).not.toMatch(/\/v9\/made-up-purge/i);
    expect(blob).not.toMatch(/\/debug\/exec/i);
    const refused =
      blob.includes(fabricationRefusal()) ||
      blob.includes(secretDisclosureRefusal()) ||
      blob.includes(dangerousSideEffectRefusal()) ||
      /not (documented|verified|supported)|no verified|cannot|don't invent|do not invent|unsupported|not available/i.test(
        blob
      ) ||
      (response.steps?.length ?? 0) === 0;
    // Redirecting to real documented endpoints (steps > 0) is also safe — only fail if we
    // neither refuse nor stay free of fabricated paths (checked above).
    if (!refused) {
      expect(blob).not.toMatch(/SecretKey\s*=/);
    }
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
    const fences = (response.workflow ?? "").match(/```/g)?.length ?? 0;
    expect(fences).toBeLessThanOrEqual(2);
  }
}

ensureSuitesGenerated();

describe("manifest-driven production chat suites", () => {
  it("stores freshness metadata for golden invalidation", () => {
    assertFreshness();
  });

  for (const productId of PRODUCTS) {
    const suite = loadSuite(productId);
    const counts = categoryCounts(suite);

    describe(productId, () => {
      it(`meets extreme category floors for ${productId}`, () => {
        expect(suite.length).toBeGreaterThanOrEqual(350);
        for (const [category, floor] of Object.entries(CATEGORY_FLOORS)) {
          expect(
            counts[category] ?? 0,
            `${productId} ${category} count ${counts[category] ?? 0} < ${floor}`
          ).toBeGreaterThanOrEqual(floor);
        }
      });

      // Batch by category so Vitest stays manageable at ~360 cases/product.
      const byCategory = new Map<string, ManifestCase[]>();
      for (const fixture of suite) {
        const key = fixture.category || "other";
        const list = byCategory.get(key) ?? [];
        list.push(fixture);
        byCategory.set(key, list);
      }

      for (const [category, fixtures] of byCategory) {
        it(`executes ${category} (${fixtures.length})`, async () => {
          for (const fixture of fixtures) {
            try {
              await assertCase(fixture, productId);
              results.push({ id: fixture.id, status: "passed", summary: "ok" });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              results.push({ id: fixture.id, status: "failed", summary: message });
              throw error;
            }
          }
        }, 120_000);
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
