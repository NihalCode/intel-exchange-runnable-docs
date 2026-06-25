import { describe, expect, it } from "vitest";
import {
  parsePostmanCollection,
  parsePostmanUrl,
  resolveInheritedAuth,
  extractPostmanVariables,
} from "../postman";

const SAMPLE_COLLECTION = {
  info: { name: "Demo API", description: "Test collection" },
  auth: {
    type: "apikey",
    apikey: [
      { key: "key", value: "X-API-Key" },
      { key: "value", value: "{{API_KEY}}" },
    ],
  },
  variable: [{ key: "base_url", value: "https://example.com" }],
  item: [
    {
      name: "Authentication",
      auth: { type: "noauth" },
      item: [
        {
          name: "List Items",
          request: {
            method: "GET",
            url: "{{base_url}}/v1/items/?org={{ORG_ID}}",
            header: [{ key: "Authorization", value: "Bearer {{ACCESS_TOKEN}}" }],
          },
          response: [
            {
              name: "OK",
              code: 200,
              header: [{ key: "Content-Type", value: "application/json" }],
              body: '{"items":[]}',
            },
          ],
        },
      ],
    },
    {
      name: "Cyware Ping",
      request: {
        method: "GET",
        url: "{{base_url}}/ping/?AccessID={{open_api_access_id}}&Signature={{signature}}&Expires={{expires}}",
      },
    },
  ],
};

describe("parsePostmanUrl", () => {
  it("extracts path params and placeholders", () => {
    const r = parsePostmanUrl("{{base_url}}/v1/items/:id/?page=1");
    expect(r.path).toBe("/v1/items/{id}/");
    expect(r.pathParams).toHaveLength(1);
    expect(r.baseUrlPlaceholders).toContain("base_url");
  });
});

describe("resolveInheritedAuth", () => {
  it("inherits collection apikey auth", () => {
    const collection = resolveInheritedAuth(
      { type: "apikey", credentialPlaceholders: ["API_KEY"], fields: [] },
      [],
      { type: "none", credentialPlaceholders: [], fields: [] },
      [],
      []
    );
    expect(collection.credentialPlaceholders).toContain("API_KEY");
  });

  it("detects Cyware Open API query auth", () => {
    const auth = resolveInheritedAuth(
      { type: "none", credentialPlaceholders: [], fields: [] },
      [],
      { type: "none", credentialPlaceholders: [], fields: [] },
      [],
      ["AccessID", "Signature", "Expires"]
    );
    expect(auth.type).toBe("cyware-open-api");
  });
});

describe("parsePostmanCollection", () => {
  it("parses nested folders and responses", () => {
    const parsed = parsePostmanCollection(SAMPLE_COLLECTION, { productId: "demo" });
    expect(parsed.endpoints).toHaveLength(2);
    expect(parsed.sections.length).toBeGreaterThan(1);
    const list = parsed.endpoints.find((e) => e.endpointName === "List Items");
    expect(list?.method).toBe("GET");
    expect(list?.responses).toHaveLength(1);
    expect(list?.credentialPlaceholders.some((p) => /ORG|ACCESS|API/i.test(p))).toBe(true);
  });

  it("never includes raw secret values in placeholders", () => {
    const parsed = parsePostmanCollection(SAMPLE_COLLECTION, { productId: "demo" });
    const text = JSON.stringify(parsed);
    expect(text).not.toMatch(/sk-[a-z0-9]{20,}/);
    expect(text).not.toContain("super-secret-value");
  });
});

describe("extractPostmanVariables", () => {
  it("finds variables in templates", () => {
    expect(extractPostmanVariables("{{BASE_URL}}/x?key={{API_KEY}}")).toEqual([
      "BASE_URL",
      "API_KEY",
    ]);
  });
});
