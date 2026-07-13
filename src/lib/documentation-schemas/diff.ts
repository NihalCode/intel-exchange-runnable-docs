import type { DocumentationSchemaFormat } from "@/lib/documentation-schemas/validation";

export interface SchemaDiffItem {
  classification: "breaking" | "nonbreaking" | "docs-only";
  kind: string;
  location: string;
  message: string;
}

export interface SchemaDiff {
  breakingCount: number;
  nonbreakingCount: number;
  docsOnlyCount: number;
  items: SchemaDiffItem[];
}

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function operations(schema: unknown): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const [path, pathValue] of Object.entries(object(object(schema).paths))) {
    const item = object(pathValue);
    for (const method of METHODS) {
      if (item[method]) result.set(`${method.toUpperCase()} ${path}`, object(item[method]));
    }
  }
  return result;
}

function parameters(operation: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const parameter of Array.isArray(operation.parameters) ? operation.parameters : []) {
    const value = object(parameter);
    result.set(`${String(value.in)}:${String(value.name)}`, value);
  }
  return result;
}

export function diffDocumentationSchemas(input: {
  format: DocumentationSchemaFormat;
  previous: unknown;
  next: unknown;
}): SchemaDiff {
  const items: SchemaDiffItem[] = [];
  if (input.format === "openapi-json" || input.format === "openapi-yaml") {
    const before = operations(input.previous);
    const after = operations(input.next);
    for (const [signature, operation] of before) {
      const nextOperation = after.get(signature);
      if (!nextOperation) {
        items.push({
          classification: "breaking",
          kind: "endpoint-removed",
          location: signature,
          message: "Endpoint was removed.",
        });
        continue;
      }
      const beforeParams = parameters(operation);
      const afterParams = parameters(nextOperation);
      for (const [name, parameter] of beforeParams) {
        if (!afterParams.has(name)) {
          items.push({
            classification: "breaking",
            kind: "parameter-removed",
            location: `${signature} ${name}`,
            message: "Parameter was removed.",
          });
        } else if (
          parameter.required !== true &&
          afterParams.get(name)?.required === true
        ) {
          items.push({
            classification: "breaking",
            kind: "parameter-required",
            location: `${signature} ${name}`,
            message: "An optional parameter became required.",
          });
        }
      }
      for (const [name, parameter] of afterParams) {
        if (!beforeParams.has(name)) {
          items.push({
            classification: parameter.required === true ? "breaking" : "nonbreaking",
            kind: "parameter-added",
            location: `${signature} ${name}`,
            message:
              parameter.required === true
                ? "A required parameter was added."
                : "An optional parameter was added.",
          });
        }
      }
      if (String(operation.description ?? "") !== String(nextOperation.description ?? "")) {
        items.push({
          classification: "docs-only",
          kind: "description-changed",
          location: signature,
          message: "Operation description changed.",
        });
      }
      if (operation.deprecated !== true && nextOperation.deprecated === true) {
        items.push({
          classification: "nonbreaking",
          kind: "deprecated",
          location: signature,
          message: "Endpoint was marked deprecated.",
        });
      }
      const beforeSecurity = JSON.stringify(operation.security ?? object(input.previous).security ?? []);
      const afterSecurity = JSON.stringify(nextOperation.security ?? object(input.next).security ?? []);
      if (beforeSecurity !== afterSecurity) {
        items.push({
          classification: "breaking",
          kind: "security-changed",
          location: signature,
          message: "Authentication requirements or scopes changed.",
        });
      }
      const beforeResponses = new Set(Object.keys(object(operation.responses)));
      const afterResponses = new Set(Object.keys(object(nextOperation.responses)));
      for (const status of beforeResponses) {
        if (!afterResponses.has(status)) {
          items.push({
            classification: "breaking",
            kind: "response-removed",
            location: `${signature} ${status}`,
            message: "A documented response status was removed.",
          });
        }
      }
    }
    for (const signature of after.keys()) {
      if (!before.has(signature)) {
        items.push({
          classification: "nonbreaking",
          kind: "endpoint-added",
          location: signature,
          message: "Endpoint was added.",
        });
      }
    }
  } else {
    const before = JSON.stringify(input.previous);
    const after = JSON.stringify(input.next);
    if (before !== after) {
      items.push({
        classification: "nonbreaking",
        kind: `${input.format}-structure-changed`,
        location: "$",
        message: "Schema structure changed; review the generated preview before publishing.",
      });
    }
  }
  return {
    breakingCount: items.filter((item) => item.classification === "breaking").length,
    nonbreakingCount: items.filter((item) => item.classification === "nonbreaking").length,
    docsOnlyCount: items.filter((item) => item.classification === "docs-only").length,
    items,
  };
}
