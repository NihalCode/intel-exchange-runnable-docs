import { describe, expect, it } from "vitest";

import { diffDocumentationSchemas } from "@/lib/documentation-schemas/diff";
import { assertSchemaReviewAllowed } from "@/lib/documentation-schemas/service";
import { validateDocumentationSchema } from "@/lib/documentation-schemas/validation";

const OPENAPI = {
  openapi: "3.1.0",
  info: { title: "Example", version: "1.0.0" },
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        parameters: [{ name: "limit", in: "query", required: false }],
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

describe("documentation schema validation", () => {
  it("validates OpenAPI JSON and YAML", () => {
    const json = validateDocumentationSchema({
      format: "openapi-json",
      source: JSON.stringify(OPENAPI),
    });
    const yaml = validateDocumentationSchema({
      format: "openapi-yaml",
      source: `openapi: 3.1.0
info:
  title: Example
  version: 1.0.0
paths:
  /items:
    get:
      operationId: listItems
      responses:
        "200":
          description: OK`,
    });
    expect(json.valid).toBe(true);
    expect(yaml.valid).toBe(true);
    expect(json.hash).toHaveLength(64);
  });

  it("rejects duplicate operation IDs and remote refs", () => {
    const invalid = structuredClone(OPENAPI) as Record<string, unknown>;
    invalid.paths = {
      "/a": {
        get: {
          operationId: "same",
          responses: { "200": {} },
          requestBody: { $ref: "https://example.com/schema.json" },
        },
      },
      "/b": { post: { operationId: "same", responses: { "200": {} } } },
    };
    const result = validateDocumentationSchema({
      format: "openapi-json",
      source: JSON.stringify(invalid),
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["DUPLICATE_OPERATION_ID", "REMOTE_REF_BLOCKED"])
    );
  });

  it("validates Postman, Theneo, and GraphQL inputs", () => {
    const postman = validateDocumentationSchema({
      format: "postman-json",
      productId: "ctix",
      source: JSON.stringify({
        info: { name: "Example" },
        item: [{ name: "Ping", request: { method: "GET", url: "{{baseUrl}}/ping/" } }],
      }),
    });
    const theneo = validateDocumentationSchema({
      format: "theneo",
      source: JSON.stringify({
        kind: "section",
        slug: "overview",
        title: "Overview",
        breadcrumb: [],
        markdown: "# Overview",
      }),
    });
    const graphql = validateDocumentationSchema({
      format: "graphql-sdl",
      source: "type Query { ping: String! }",
    });
    expect(postman.valid).toBe(true);
    expect(theneo.valid).toBe(true);
    expect(graphql.valid).toBe(true);
  });
});

describe("documentation schema diff", () => {
  it("classifies removed endpoints and new required parameters as breaking", () => {
    const next = structuredClone(OPENAPI);
    next.paths["/items"]!.get.parameters = [
      { name: "tenant", in: "query", required: true },
    ];
    const diff = diffDocumentationSchemas({
      format: "openapi-json",
      previous: {
        ...OPENAPI,
        paths: {
          ...OPENAPI.paths,
          "/legacy": { get: { responses: { "200": {} } } },
        },
      },
      next,
    });
    expect(diff.breakingCount).toBeGreaterThanOrEqual(2);
    expect(diff.items.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["endpoint-removed", "parameter-added"])
    );
  });
});

describe("schema review separation of duties", () => {
  it("blocks developers and self-approval", () => {
    expect(() =>
      assertSchemaReviewAllowed({
        reviewerRole: "developer",
        reviewerUserId: "reviewer",
        authorUserId: "author",
        reason: "reviewed",
      })
    ).toThrow("FORBIDDEN");
    expect(() =>
      assertSchemaReviewAllowed({
        reviewerRole: "admin",
        reviewerUserId: "same",
        authorUserId: "same",
        reason: "reviewed",
      })
    ).toThrow("SELF_APPROVAL_FORBIDDEN");
  });
});
