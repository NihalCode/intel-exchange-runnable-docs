import { DISPLAY_BASE } from "./constants";
import type {
  CodeSnippet,
  EndpointPage,
  KeyValue,
  ParamField,
  RunnableRequest,
} from "./types";

// Auth query params required by every Intel Exchange Open API request.
const AUTH_QUERY: KeyValue[] = [
  { name: "AccessID", value: "<your access id>" },
  { name: "Signature", value: "<generated signature>" },
  { name: "Expires", value: "<unix expiry>" },
];

function coerceValue(field: ParamField): unknown {
  const type = (field.valueType || "string").toLowerCase();
  const raw = field.value ?? "";

  if (type === "array") {
    if (field.items && field.items.length > 0) {
      return [coerceValue(field.items[0])];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return raw ? [raw] : [];
    }
  }

  if (type === "object") {
    if (field.complexItems && field.complexItems.length > 0) {
      return buildObject(field.complexItems);
    }
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (type === "boolean") return raw === "true";

  if (type === "integer" || type === "number" || type === "float") {
    const n = Number(raw);
    return Number.isFinite(n) && raw !== "" ? n : raw;
  }

  return raw;
}

function buildObject(fields: ParamField[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.name) continue;
    obj[f.name] = coerceValue(f);
  }
  return obj;
}

function buildBody(fields: ParamField[] | undefined): unknown | undefined {
  if (!fields || fields.length === 0) return undefined;
  return buildObject(fields);
}

function normalizePath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function queryString(pairs: KeyValue[]): string {
  if (pairs.length === 0) return "";
  return (
    "?" +
    pairs
      .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`)
      .join("&")
  );
}

function fieldsToKeyValues(fields: ParamField[] | undefined): KeyValue[] {
  if (!fields) return [];
  return fields
    .filter((f) => f.name)
    .map((f) => ({ name: f.name, value: f.value ?? "" }));
}

export function buildRunnableRequest(page: EndpointPage): RunnableRequest {
  const query = [...fieldsToKeyValues(page.request?.query), ...AUTH_QUERY];
  const headers = fieldsToKeyValues(page.request?.header);
  const contentType = page.contentType || "application/json";
  const bodyObj = buildBody(page.request?.body);
  const hasBody = bodyObj !== undefined && page.method !== "GET";

  if (hasBody && !headers.some((h) => h.name.toLowerCase() === "content-type")) {
    headers.unshift({ name: "Content-Type", value: contentType });
  }

  return {
    method: page.method,
    path: normalizePath(page.path),
    query,
    headers,
    body: hasBody ? JSON.stringify(bodyObj, null, 2) : undefined,
    contentType,
  };
}

function curlSnippet(req: RunnableRequest): string {
  const url = `${DISPLAY_BASE}${req.path}${queryString(req.query)}`;
  const lines = [`curl --request ${req.method} \\`, `  --url "${url}"`];
  for (const h of req.headers) {
    lines[lines.length - 1] += " \\";
    lines.push(`  --header "${h.name}: ${h.value}"`);
  }
  if (req.body) {
    lines[lines.length - 1] += " \\";
    lines.push(`  --data '${req.body}'`);
  }
  return lines.join("\n");
}

function jsSnippet(req: RunnableRequest): string {
  const url = `${DISPLAY_BASE}${req.path}${queryString(req.query)}`;
  const headerObj: Record<string, string> = {};
  for (const h of req.headers) headerObj[h.name] = h.value;
  const init: string[] = [`  method: "${req.method}",`];
  if (req.headers.length > 0) {
    init.push(`  headers: ${JSON.stringify(headerObj, null, 2).replace(/\n/g, "\n  ")},`);
  }
  if (req.body) {
    init.push(`  body: JSON.stringify(${req.body.replace(/\n/g, "\n  ")}),`);
  }
  return [
    `const url = "${url}";`,
    ``,
    `const response = await fetch(url, {`,
    ...init,
    `});`,
    ``,
    `const data = await response.json();`,
    `console.log(response.status, data);`,
  ].join("\n");
}

function pySnippet(req: RunnableRequest): string {
  const headerObj: Record<string, string> = {};
  for (const h of req.headers) headerObj[h.name] = h.value;
  const params: Record<string, string> = {};
  for (const q of req.query) params[q.name] = q.value;
  const lines = [
    `import requests`,
    ``,
    `url = "${DISPLAY_BASE}${req.path}"`,
    `params = ${pyDict(params)}`,
    `headers = ${pyDict(headerObj)}`,
  ];
  if (req.body) {
    lines.push(`payload = ${req.body}`);
    lines.push(
      `response = requests.request("${req.method}", url, params=params, headers=headers, json=payload)`
    );
  } else {
    lines.push(
      `response = requests.request("${req.method}", url, params=params, headers=headers)`
    );
  }
  lines.push(`print(response.status_code)`);
  lines.push(`print(response.text)`);
  return lines.join("\n");
}

function pyDict(obj: Record<string, string>): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}";
  return (
    "{\n" +
    keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(obj[k])}`).join(",\n") +
    "\n}"
  );
}

function responseExample(page: EndpointPage): string | null {
  const ok =
    page.responses?.find((r) => r.statusCode && r.statusCode < 400) ||
    page.responses?.[0];
  if (!ok || !ok.body || ok.body.length === 0) return null;
  return JSON.stringify(buildObject(ok.body), null, 2);
}

/** Build the full set of code snippets shown for an endpoint page. */
export function buildEndpointSnippets(page: EndpointPage): CodeSnippet[] {
  const req = buildRunnableRequest(page);
  const snippets: CodeSnippet[] = [];

  snippets.push({
    lang: "bash",
    label: "cURL",
    code: curlSnippet(req),
    runKind: "http",
    request: req,
  });

  snippets.push({
    lang: "javascript",
    label: "JavaScript",
    code: jsSnippet(req),
    runKind: "javascript",
  });

  snippets.push({
    lang: "python",
    label: "Python",
    code: pySnippet(req),
    runKind: "python",
  });

  if (req.body) {
    snippets.push({
      lang: "json",
      label: "Request Body",
      code: req.body,
      runKind: "json",
    });
  }

  const respExample = responseExample(page);
  if (respExample) {
    snippets.push({
      lang: "json",
      label: "Example Response",
      code: respExample,
      runKind: "json",
    });
  }

  return snippets;
}
