import { createHash } from "node:crypto";

import { buildASTSchema, parse as parseGraphql, validateSchema } from "graphql";
import { parseDocument } from "yaml";

import { parsePostmanCollection } from "@/lib/postman/parse-collection";

export const DOCUMENTATION_SCHEMA_FORMATS = [
  "openapi-json",
  "openapi-yaml",
  "postman-json",
  "theneo",
  "graphql-sdl",
] as const;
export type DocumentationSchemaFormat = (typeof DOCUMENTATION_SCHEMA_FORMATS)[number];
export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
}

export interface SchemaValidation {
  valid: boolean;
  format: DocumentationSchemaFormat;
  hash: string;
  issues: ValidationIssue[];
  summary: {
    title: string;
    endpointCount: number;
    pageCount: number;
  };
  parsed: unknown;
}

const MAX_SCHEMA_BYTES = 5 * 1024 * 1024;
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
const SENSITIVE_KEY = /(secret|password|token|api[-_]?key|access[-_]?id|signature)/i;

export function stableSourceHash(source: string): string {
  return createHash("sha256").update(source.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

function issue(
  issues: ValidationIssue[],
  severity: ValidationSeverity,
  code: string,
  message: string,
  path?: string
): void {
  issues.push({ severity, code, message, ...(path ? { path } : {}) });
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveLocalRef(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, part) => asObject(current)?.[part], root);
}

function walk(
  value: unknown,
  callback: (value: unknown, path: string, key: string | null) => void,
  path = "$",
  key: string | null = null,
  seen = new WeakSet<object>()
): void {
  callback(value, path, key);
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => walk(child, callback, `${path}[${index}]`, String(index), seen));
  } else {
    Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) =>
      walk(child, callback, `${path}.${childKey}`, childKey, seen)
    );
  }
}

function validateOpenApi(parsed: unknown, issues: ValidationIssue[]): SchemaValidation["summary"] {
  const root = asObject(parsed);
  if (!root) {
    issue(issues, "error", "OPENAPI_OBJECT_REQUIRED", "OpenAPI document must be an object.");
    return { title: "OpenAPI schema", endpointCount: 0, pageCount: 0 };
  }
  if (!/^3\.\d+\.\d+/.test(String(root.openapi ?? ""))) {
    issue(issues, "error", "OPENAPI_VERSION", "The openapi field must specify OpenAPI 3.x.", "$.openapi");
  }
  const info = asObject(root.info);
  if (!String(info?.title ?? "").trim()) {
    issue(issues, "error", "INFO_TITLE_REQUIRED", "info.title is required.", "$.info.title");
  }
  if (!String(info?.version ?? "").trim()) {
    issue(issues, "error", "INFO_VERSION_REQUIRED", "info.version is required.", "$.info.version");
  }
  const paths = asObject(root.paths);
  if (!paths) issue(issues, "error", "PATHS_REQUIRED", "paths must be an object.", "$.paths");

  const operationIds = new Map<string, string>();
  let endpointCount = 0;
  for (const [pathName, pathValue] of Object.entries(paths ?? {})) {
    const pathItem = asObject(pathValue);
    if (!pathItem) continue;
    for (const method of METHODS) {
      const operation = asObject(pathItem[method]);
      if (!operation) continue;
      endpointCount += 1;
      const operationId = String(operation.operationId ?? "").trim();
      if (operationId) {
        const previous = operationIds.get(operationId);
        if (previous) {
          issue(
            issues,
            "error",
            "DUPLICATE_OPERATION_ID",
            `operationId "${operationId}" is duplicated.`,
            `$.paths.${pathName}.${method}`
          );
        } else {
          operationIds.set(operationId, `${method.toUpperCase()} ${pathName}`);
        }
      }
      if (!asObject(operation.responses)) {
        issue(
          issues,
          "error",
          "RESPONSES_REQUIRED",
          "Each operation requires a responses object.",
          `$.paths.${pathName}.${method}.responses`
        );
      }
    }
  }

  const servers = Array.isArray(root.servers) ? root.servers : [];
  servers.forEach((server, index) => {
    const raw = String(asObject(server)?.url ?? "");
    if (!raw) return;
    if (raw.includes("{")) {
      issue(issues, "info", "SERVER_TEMPLATE", "Server URL uses variables.", `$.servers[${index}].url`);
      return;
    }
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") {
        issue(issues, "warning", "SERVER_NOT_HTTPS", "Server URL is not HTTPS.", `$.servers[${index}].url`);
      }
    } catch {
      issue(issues, "error", "SERVER_URL_INVALID", "Server URL is invalid.", `$.servers[${index}].url`);
    }
  });

  walk(root, (value, path, key) => {
    const object = asObject(value);
    if (object?.$ref != null) {
      const ref = String(object.$ref);
      if (!ref.startsWith("#/")) {
        issue(issues, "error", "REMOTE_REF_BLOCKED", "Remote references are not allowed.", `${path}.$ref`);
      } else if (resolveLocalRef(root, ref) === undefined) {
        issue(issues, "error", "UNRESOLVED_REF", `Reference "${ref}" cannot be resolved.`, `${path}.$ref`);
      }
    }
    if (
      key &&
      SENSITIVE_KEY.test(key) &&
      typeof value === "string" &&
      value.length >= 8 &&
      !/^(example|sample|your_|<|\{\{)/i.test(value)
    ) {
      issue(issues, "warning", "SENSITIVE_LITERAL", "Possible credential literal was redacted.", path);
    }
    if (key === "example" && object?.type === "integer" && typeof object.example === "string") {
      issue(issues, "warning", "EXAMPLE_TYPE_MISMATCH", "Example does not match integer schema.", path);
    }
  });

  return {
    title: String(info?.title ?? "OpenAPI schema"),
    endpointCount,
    pageCount: endpointCount + 1,
  };
}

function parseJson(source: string): unknown {
  return JSON.parse(source) as unknown;
}

export function validateDocumentationSchema(input: {
  format: DocumentationSchemaFormat;
  source: string;
  productId?: string;
}): SchemaValidation {
  if (Buffer.byteLength(input.source, "utf8") > MAX_SCHEMA_BYTES) {
    throw new Error("SCHEMA_TOO_LARGE");
  }
  const issues: ValidationIssue[] = [];
  let parsed: unknown = null;
  let summary = { title: "Documentation schema", endpointCount: 0, pageCount: 0 };
  try {
    if (input.format === "openapi-json") {
      parsed = parseJson(input.source);
      summary = validateOpenApi(parsed, issues);
    } else if (input.format === "openapi-yaml") {
      const document = parseDocument(input.source, {
        schema: "core",
        prettyErrors: false,
      });
      for (const error of document.errors) {
        issue(issues, "error", "YAML_PARSE_ERROR", error.message);
      }
      parsed = document.toJS({ maxAliasCount: 50 });
      summary = validateOpenApi(parsed, issues);
    } else if (input.format === "postman-json") {
      parsed = parseJson(input.source);
      const collection = parsePostmanCollection(parsed, {
        productId: input.productId ?? "ctix",
      });
      const endpointCount = collection.endpoints.length;
      summary = {
        title: collection.collectionName,
        endpointCount,
        pageCount: endpointCount + collection.sections.length,
      };
      if (!endpointCount) {
        issue(issues, "warning", "POSTMAN_EMPTY", "Collection contains no requests.");
      }
    } else if (input.format === "graphql-sdl") {
      const document = parseGraphql(input.source, { noLocation: true });
      const schema = buildASTSchema(document);
      validateSchema(schema).forEach((error) =>
        issue(issues, "error", "GRAPHQL_SCHEMA_ERROR", error.message)
      );
      parsed = document;
      const fields = Object.values(schema.getQueryType()?.getFields() ?? {});
      summary = {
        title: "GraphQL API",
        endpointCount: fields.length,
        pageCount: Object.keys(schema.getTypeMap()).filter((name) => !name.startsWith("__")).length,
      };
    } else {
      try {
        parsed = parseJson(input.source);
        const page = asObject(parsed);
        const kind = page?.kind;
        if (
          kind !== "endpoint" &&
          kind !== "section" &&
          !Array.isArray(parsed) &&
          !asObject(parsed)?.pages
        ) {
          issue(issues, "error", "THENEO_SHAPE_INVALID", "Legacy JSON must contain Theneo page data.");
        }
        const pages = Array.isArray(parsed) ? parsed : Array.isArray(page?.pages) ? page.pages : [parsed];
        summary = {
          title: String(page?.title ?? "Theneo documentation"),
          endpointCount: pages.filter((item) => asObject(item)?.kind === "endpoint").length,
          pageCount: pages.length,
        };
      } catch {
        parsed = input.source;
        if (!/^#{1,6}\s+\S+/m.test(input.source)) {
          issue(issues, "error", "THENEO_MARKDOWN_INVALID", "Legacy Markdown requires a heading.");
        }
        summary = { title: "Theneo documentation", endpointCount: 0, pageCount: 1 };
      }
    }
  } catch (error) {
    issue(
      issues,
      "error",
      "PARSE_ERROR",
      error instanceof Error ? error.message : "Schema could not be parsed."
    );
  }
  return {
    valid: !issues.some((item) => item.severity === "error"),
    format: input.format,
    hash: stableSourceHash(input.source),
    issues,
    summary,
    parsed,
  };
}
