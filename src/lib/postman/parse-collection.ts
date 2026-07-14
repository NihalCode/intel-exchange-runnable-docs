import { parsePostmanAuthBlock, resolveInheritedAuth, extractPostmanVariables } from "./auth";
import type {
  ParsedPostmanCollection,
  ParsedPostmanEndpoint,
  ParsedPostmanParam,
  ParsedPostmanResponse,
  ParsedPostmanSection,
  PostmanAuthSpec,
} from "./types";

export interface ParsePostmanOptions {
  productId: string;
  rootSlug?: string;
}

function slugify(name: string): string {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parsePostmanUrl(urlRaw: string): {
  path: string;
  query: ParsedPostmanParam[];
  pathParams: ParsedPostmanParam[];
  baseUrlPlaceholders: string[];
} {
  const embeddedQuery: ParsedPostmanParam[] = [];
  const pathParamNames: string[] = [];
  const baseUrlPlaceholders: string[] = [];
  let s = String(urlRaw || "").trim();

  const baseMatch = s.match(/^\{\{([^}]+)\}\}\/?/i);
  if (baseMatch) {
    baseUrlPlaceholders.push(baseMatch[1]!.trim());
    s = s.replace(/^\{\{[^}]+\}\}\/?/i, "");
  }

  const qIdx = s.indexOf("?");
  if (qIdx !== -1) {
    const qs = s.slice(qIdx + 1);
    s = s.slice(0, qIdx);
    for (const part of qs.split("&")) {
      const eq = part.indexOf("=");
      const name = (eq === -1 ? part : part.slice(0, eq)).trim();
      const val = eq === -1 ? "" : part.slice(eq + 1).trim();
      if (!name) continue;
      if (["AccessID", "Signature", "Expires"].includes(name)) continue;
      const vars = extractPostmanVariables(val);
      embeddedQuery.push({
        name,
        required: false,
        example: vars.length ? `<${vars[0]}>` : val ? decodeURIComponent(val) : "",
        valueType: "string",
      });
    }
  }

  s = s.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    pathParamNames.push(name);
    return `{${name}}`;
  });

  for (const v of extractPostmanVariables(s)) {
    baseUrlPlaceholders.push(v);
  }
  s = s.replace(/\{\{([^}]+)\}\}/g, () => "");

  s = s.replace(/\/+/g, "/");
  if (!s.startsWith("/")) s = `/${s}`;

  const pathParams = pathParamNames.map((name) => ({
    name,
    required: true,
    example: `<${name.toUpperCase()}>`,
    valueType: "string",
  }));

  return { path: s, query: embeddedQuery, pathParams, baseUrlPlaceholders };
}

function objectToParamFields(obj: Record<string, unknown>, prefix = ""): ParsedPostmanParam[] {
  const fields: ParsedPostmanParam[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      fields.push(...objectToParamFields(val as Record<string, unknown>, prefix ? `${prefix}.${key}` : key));
    } else {
      fields.push({
        name: key,
        required: false,
        example: Array.isArray(val) ? JSON.stringify(val) : String(val ?? ""),
        valueType: Array.isArray(val) ? "array" : typeof val,
      });
    }
  }
  return fields;
}

function parseResponses(item: { response?: unknown[] }): ParsedPostmanResponse[] {
  const out: ParsedPostmanResponse[] = [];
  for (const r of item.response ?? []) {
    if (!r || typeof r !== "object") continue;
    const resp = r as {
      name?: string;
      code?: number;
      status?: string;
      header?: { key: string; value: string }[];
      body?: string;
    };
    const statusCode = resp.code ?? 200;
    const contentType =
      resp.header?.find((h) => h.key?.toLowerCase() === "content-type")?.value ??
      "application/json";
    out.push({
      statusCode,
      name: resp.name ?? resp.status ?? String(statusCode),
      contentType,
      bodyPreview: (resp.body ?? "").slice(0, 2000),
    });
  }
  return out;
}

function toEndpointPageRecord(ep: ParsedPostmanEndpoint, breadcrumb: string[]) {
  return {
    slug: ep.slug,
    title: ep.endpointName,
    kind: "endpoint" as const,
    breadcrumb,
    description: ep.description,
    method: ep.method,
    path: ep.path,
    request: {
      query: ep.query.map((q) => ({
        name: q.name,
        description: q.description,
        isRequired: q.required,
        value: q.example,
        valueType: q.valueType,
      })),
      header: ep.headers.map((h) => ({
        name: h.name,
        description: h.description,
        isRequired: h.required,
        value: h.example,
        valueType: h.valueType,
      })),
      body: ep.bodyFields.map((b) => ({
        name: b.name,
        isRequired: b.required,
        value: b.example,
        valueType: b.valueType,
      })),
      path: ep.pathParams.map((p) => ({
        name: p.name,
        isRequired: p.required,
        value: p.example,
        valueType: p.valueType,
      })),
      contentType: ep.contentType,
    },
    responses: ep.responses.map((r) => ({
      statusCode: r.statusCode,
      description: r.name,
      contentType: r.contentType,
      body: r.bodyPreview ? [{ name: "body", value: r.bodyPreview, valueType: "string" }] : [],
    })),
    postmanMeta: {
      auth: ep.auth,
      credentialPlaceholders: ep.credentialPlaceholders,
      runnableStatus: ep.runnableStatus,
      folderPath: ep.folderPath,
      baseUrlPlaceholder: ep.baseUrlPlaceholder,
    },
  };
}

/** Convert parsed endpoints to vendored page JSON records (ingest-compatible). */
export function parsedEndpointsToPageRecords(parsed: ParsedPostmanCollection): unknown[] {
  const records: unknown[] = parsed.sections.map((s) => ({
    slug: s.slug,
    title: s.title,
    kind: "section",
    breadcrumb: s.breadcrumb,
    markdown: s.markdown,
  }));
  for (const ep of parsed.endpoints) {
    records.push(toEndpointPageRecord(ep, ep.slug.split("/")));
  }
  return records;
}

/**
 * Parse a Postman Collection v2.1 JSON object into structured documentation records.
 */
export function parsePostmanCollection(
  collectionJson: unknown,
  options: ParsePostmanOptions
): ParsedPostmanCollection {
  const col = collectionJson as {
    info?: { name?: string; description?: string };
    auth?: unknown;
    variable?: { key: string; value?: string }[];
    item?: unknown[];
  };

  const productId = options.productId;
  const rootSlug = options.rootSlug ?? `${productId}-api-reference`;
  const collectionName = col.info?.name ?? `${productId} API`;
  const collectionAuth = parsePostmanAuthBlock(col.auth);

  const baseUrlVariables = (col.variable ?? [])
    .filter((v) => /base|url|host|server/i.test(v.key))
    .map((v) => v.key);

  const sections: ParsedPostmanSection[] = [
    {
      slug: rootSlug,
      title: collectionName,
      breadcrumb: [rootSlug],
      markdown: col.info?.description ?? "",
    },
  ];

  const endpoints: ParsedPostmanEndpoint[] = [];
  const allPlaceholders = new Set<string>(collectionAuth.credentialPlaceholders);

  function walk(
    items: unknown[],
    breadcrumb: string[],
    folderAuths: PostmanAuthSpec[],
    folderNames: string[]
  ) {
    for (const raw of items ?? []) {
      const item = raw as {
        name?: string;
        description?: string;
        auth?: unknown;
        item?: unknown[];
        request?: {
          method?: string;
          description?: string;
          auth?: unknown;
          header?: { key: string; value: string; description?: string; disabled?: boolean }[];
          url?: string | { raw?: string; query?: { key: string; value?: string; description?: string; disabled?: boolean }[] };
          body?: { mode?: string; raw?: string };
        };
        response?: unknown[];
      };

      if (!item?.name) continue;

      const itemAuth = parsePostmanAuthBlock(item.auth);
      const nextFolderAuths = itemAuth.type !== "none" ? [...folderAuths, itemAuth] : folderAuths;

      if (item.item) {
        const sectionSlug = [...breadcrumb, slugify(item.name)].join("/");
        sections.push({
          slug: sectionSlug,
          title: item.name,
          breadcrumb: sectionSlug.split("/"),
          markdown: item.description ?? "",
        });
        walk(item.item, sectionSlug.split("/"), nextFolderAuths, [...folderNames, item.name]);
      } else if (item.request) {
        const slug = [...breadcrumb, slugify(item.name)].join("/");
        const req = item.request;
        const method = (req.method || "GET").toUpperCase();
        const urlRaw =
          typeof req.url === "string" ? req.url : req.url?.raw ?? "";
        const parsedUrl = parsePostmanUrl(urlRaw);

        const query: ParsedPostmanParam[] = [
          ...parsedUrl.query,
          ...(req.url && typeof req.url === "object" ? req.url.query ?? [] : []).map((q) => ({
            name: q.key,
            description: q.description,
            required: !q.disabled,
            example: extractPostmanVariables(q.value ?? "").length
              ? `<${extractPostmanVariables(q.value ?? "")[0]}>`
              : q.value ?? "",
            valueType: "string",
          })),
        ];

        const headers: ParsedPostmanParam[] = (req.header ?? []).map((h) => ({
          name: h.key,
          description: h.description,
          required: !h.disabled,
          example: extractPostmanVariables(h.value ?? "").length
            ? `<${extractPostmanVariables(h.value ?? "")[0]}>`
            : h.value ?? "",
          valueType: "string",
        }));

        const requestAuth = parsePostmanAuthBlock(req.auth);
        const auth = resolveInheritedAuth(
          collectionAuth,
          folderAuths,
          requestAuth,
          headers.map((h) => ({ name: h.name, value: h.example })),
          query.map((q) => q.name)
        );

        let bodyFields: ParsedPostmanParam[] = [];
        const contentType = "application/json";
        if (req.body?.mode === "raw" && req.body.raw) {
          try {
            bodyFields = objectToParamFields(JSON.parse(req.body.raw) as Record<string, unknown>);
          } catch {
            bodyFields = [{ name: "body", required: false, example: req.body.raw, valueType: "string" }];
          }
        }

        const credentialPlaceholders = [
          ...new Set([
            ...auth.credentialPlaceholders,
            ...parsedUrl.baseUrlPlaceholders,
            ...extractPostmanVariables(urlRaw),
          ]),
        ];
        for (const p of credentialPlaceholders) allPlaceholders.add(p);

        const responses = parseResponses(item);

        endpoints.push({
          apiName: productId,
          collectionName,
          folderPath: folderNames,
          endpointName: item.name,
          slug,
          method,
          path: parsedUrl.path,
          baseUrlPlaceholder: parsedUrl.baseUrlPlaceholders[0] ?? "BASE_URL",
          query,
          headers,
          pathParams: parsedUrl.pathParams,
          bodyFields,
          contentType,
          description: req.description ?? item.description ?? item.name,
          auth,
          responses,
          credentialPlaceholders,
          runnableStatus: "docs_only_available",
        });
      }
    }
  }

  walk(col.item ?? [], [rootSlug], [], []);

  for (const ep of endpoints) {
    ep.runnableStatus =
      ep.auth.type === "none" && ep.credentialPlaceholders.length === 0
        ? "docs_only_available"
        : "runnable_with_developer_credentials";
  }

  return {
    collectionName,
    productId,
    rootSlug,
    baseUrlVariables,
    collectionAuth,
    credentialPlaceholders: [...allPlaceholders],
    sections,
    endpoints,
  };
}
