import { describe, expect, it } from "vitest";
import { resolveAgentIntent } from "../agent/intent";
import { runAgent } from "../agent/orchestrate";
import { generateAppBlueprint } from "../agent/app-builder";
import { buildStepSpec } from "../agent/spec";
import { validateAppFiles } from "../agent/validate-app";
import type { AgentStepResult } from "../agent/types";

/**
 * Wave G — integrated chat → snippet → build → edit-intent path (deterministic).
 */
const PRODUCTS = ["ctix", "cftr", "csap", "orchestrate"] as const;

function connectivityStep(product: (typeof PRODUCTS)[number]): AgentStepResult {
  const paths: Record<(typeof PRODUCTS)[number], { slug: string; path: string }> = {
    ctix: { slug: "ping/ping", path: "/ping/" },
    cftr: {
      slug: "cftr-api-reference/authentication/test-connectivity",
      path: "/openapi/test-connectivity/",
    },
    csap: {
      slug: "analyst-portal/authentication/test-connectivity",
      path: "/csap/v1/test_connectivity/",
    },
    orchestrate: {
      slug: "authentication/test-connectivity",
      path: "/v1/test_connectivity/",
    },
  };
  const meta = paths[product];
  const page = {
    slug: meta.slug,
    title: "Connectivity",
    kind: "endpoint" as const,
    breadcrumb: [],
    description: "",
    method: "GET" as const,
    path: meta.path,
    request: { query: [], header: [], body: [], path: [] },
    responses: [],
  };
  return {
    order: 1,
    slug: meta.slug,
    title: "Connectivity",
    method: "GET",
    path: meta.path,
    explanation: "check",
    docUrl: `/docs/${meta.slug}`,
    warnings: [],
    params: {},
    code: "",
    request: { method: "GET", path: meta.path, query: [], headers: [] },
    meta: {},
    spec: buildStepSpec(page, { method: "GET", path: meta.path, query: [], headers: [] }, "https://tenant.example.com"),
  };
}

describe("integrated chat → build flows (Wave G)", () => {
  for (const product of PRODUCTS) {
    it(`${product}: factual → snippet intent → build blueprint → edit intent`, async () => {
      const factual = await runAgent({
        query: `How does ${product.toUpperCase()} Open API authentication work?`,
        productId: product,
        allowedProductIds: [product],
      });
      expect(`${factual.workflow ?? ""}`.length).toBeGreaterThan(20);

      const snippetIntent = resolveAgentIntent(
        "Show me a curl example for the connectivity check",
        { hasProjectFiles: false }
      );
      expect(["snippet", "workflow"]).toContain(snippetIntent.intent);

      const buildIntent = resolveAgentIntent(`Build a ${product} connectivity dashboard app`, {
        hasProjectFiles: false,
      });
      expect(buildIntent.intent).toBe("app_build");

      const app = generateAppBlueprint(
        `Build a ${product} connectivity dashboard app`,
        `${product} app`,
        "integrated",
        [connectivityStep(product)]
      );
      expect(app.files.some((f) => f.path === "package.json")).toBe(true);
      expect(validateAppFiles(app.files)).toEqual([]);
      expect(app.files.every((f) => !f.code.includes("SecretKey="))).toBe(true);

      const editIntent = resolveAgentIntent("Add a loading state to the app", {
        hasProjectFiles: true,
      });
      expect(["app_edit", "workflow", "app_build"]).toContain(editIntent.intent);
    });
  }
});
