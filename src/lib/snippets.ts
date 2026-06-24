import { DISPLAY_BASE } from "./constants";
import { authKeyValues, baseUrlForProduct } from "./products/auth";
import { isPostmanTemplatePath, normalizePostmanEndpointPath } from "./postman-path";
import { applyPathParams } from "./resolve-request";
import {
  endpointUsesMultipart,
  formFieldsFromBody,
} from "./multipart";
import type {
  CodeSnippet,
  EndpointPage,
  KeyValue,
  ParamField,
  RunnableRequest,
} from "./types";

function kvString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function coerceValue(field: ParamField): unknown {
  const type = (field.valueType || "string").toLowerCase();
  const v = field.value;

  if (type === "boolean") {
    if (typeof v === "boolean") return v;
    return kvString(v) === "true";
  }

  if (type === "integer" || type === "number" || type === "float") {
    if (typeof v === "number") return v;
    const raw = kvString(v);
    const n = Number(raw);
    return Number.isFinite(n) && raw !== "" ? n : raw;
  }

  const raw = kvString(v);

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

/** Keep only params with a non-empty value (optional params are omitted). */
function withValues(pairs: KeyValue[]): KeyValue[] {
  return pairs.filter((p) => kvString(p.value).trim() !== "");
}

function queryString(pairs: KeyValue[]): string {
  const filled = withValues(pairs);
  if (filled.length === 0) return "";
  return (
    "?" +
    filled
      .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`)
      .join("&")
  );
}

function fieldsToKeyValues(fields: ParamField[] | undefined): KeyValue[] {
  if (!fields) return [];
  return fields
    .filter((f) => f.name)
    .map((f) => ({ name: f.name, value: kvString(f.value) }));
}

export function buildRunnableRequest(page: EndpointPage, productId = "ctix"): RunnableRequest {
  const { query: authQuery, headers: authHeaders } = authKeyValues(productId);

  let path = page.path;
  let extraQuery: KeyValue[] = [];
  let extraPathParams: KeyValue[] = [];

  if (isPostmanTemplatePath(path)) {
    const normalized = normalizePostmanEndpointPath(path);
    path = normalized.path;
    extraQuery = normalized.embeddedQuery;
    extraPathParams = normalized.pathParamNames.map((name) => ({
      name,
      value: "",
    }));
  }

  const query = [
    ...fieldsToKeyValues(page.request?.query),
    ...extraQuery.filter((q) => !authQuery.some((a) => a.name === q.name)),
    ...authQuery,
  ];
  const headers = [...fieldsToKeyValues(page.request?.header), ...authHeaders];
  const contentType = page.request?.contentType || page.contentType || "application/json";
  const multipart = endpointUsesMultipart(page);
  const pathParams = [
    ...fieldsToKeyValues(page.request?.path),
    ...extraPathParams.filter(
      (p) => !fieldsToKeyValues(page.request?.path).some((x) => x.name === p.name)
    ),
  ];

  if (multipart) {
    const formFields = formFieldsFromBody(page.request?.body);
    return {
      method: page.method,
      path: normalizePath(path),
      pathParams: pathParams.length > 0 ? pathParams : undefined,
      query,
      headers: headers.filter((h) => h.name.toLowerCase() !== "content-type"),
      contentType,
      multipart: true,
      formFields,
    };
  }

  const bodyObj = buildBody(page.request?.body);
  const hasBody = bodyObj !== undefined && page.method !== "GET";

  if (hasBody && !headers.some((h) => h.name.toLowerCase() === "content-type")) {
    headers.unshift({ name: "Content-Type", value: contentType });
  }

  return {
    method: page.method,
    path: normalizePath(path),
    pathParams: pathParams.length > 0 ? pathParams : undefined,
    query,
    headers,
    body: hasBody ? JSON.stringify(bodyObj, null, 2) : undefined,
    contentType,
  };
}

function resolvedPath(req: RunnableRequest): string {
  return applyPathParams(req.path, req.pathParams);
}

function curlSnippet(req: RunnableRequest, baseUrl: string = DISPLAY_BASE): string {
  const url = `${baseUrl}${resolvedPath(req)}${queryString(req.query)}`;
  const lines = [`curl --request ${req.method} \\`, `  --url "${url}"`];
  for (const h of req.headers) {
    if (h.name.toLowerCase() === "content-type") continue;
    lines[lines.length - 1] += " \\";
    lines.push(`  --header "${h.name}: ${h.value}"`);
  }
  if (req.multipart && req.formFields?.length) {
    for (const f of req.formFields) {
      lines[lines.length - 1] += " \\";
      if (f.kind === "file") {
        lines.push(`  --form '${f.name}=@/path/to/your/file'`);
      } else if ((f.defaultValue ?? "").trim()) {
        lines.push(`  --form '${f.name}=${f.defaultValue}'`);
      } else {
        lines.push(`  --form '${f.name}='`);
      }
    }
  } else if (req.body) {
    lines[lines.length - 1] += " \\";
    lines.push(`  --data '${req.body}'`);
  }
  return lines.join("\n");
}

function jsSnippet(req: RunnableRequest, baseUrl: string = DISPLAY_BASE): string {
  const url = `${baseUrl}${resolvedPath(req)}${queryString(req.query)}`;
  const headerObj: Record<string, string> = {};
  for (const h of req.headers) {
    if (h.name.toLowerCase() === "content-type") continue;
    headerObj[h.name] = h.value;
  }
  if (req.multipart && req.formFields?.length) {
    const formLines = req.formFields.map((f) => {
      if (f.kind === "file") {
        return `formData.append("${f.name}", fileInput.files[0]); // select <input type="file" id="fileInput">`;
      }
      const val = f.defaultValue ?? "";
      return `formData.append("${f.name}", ${JSON.stringify(val)});`;
    });
    return [
      `const url = "${url}";`,
      `const formData = new FormData();`,
      ...formLines,
      ``,
      `const response = await fetch(url, {`,
      `  method: "${req.method}",`,
      Object.keys(headerObj).length ? `  headers: ${JSON.stringify(headerObj, null, 2).replace(/\n/g, "\n  ")},` : "",
      `  body: formData,`,
      `});`,
      ``,
      `const text = await response.text();`,
      `console.log(response.status, text);`,
    ]
      .filter(Boolean)
      .join("\n");
  }
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
    `const text = await response.text();`,
    `let data;`,
    `try { data = JSON.parse(text); } catch { data = text; }`,
    `console.log(response.status, data);`,
  ].join("\n");
}

function pySnippet(req: RunnableRequest, baseUrl: string = DISPLAY_BASE): string {
  const headerObj: Record<string, string> = {};
  for (const h of req.headers) {
    if (h.name.toLowerCase() === "content-type") continue;
    headerObj[h.name] = h.value;
  }
  const params: Record<string, string> = {};
  for (const q of withValues(req.query)) params[q.name] = q.value;
  const lines = [
    `import requests`,
    ``,
    `url = "${baseUrl}${resolvedPath(req)}"`,
    `params = ${pyDict(params)}`,
    `headers = ${pyDict(headerObj)}`,
  ];
  if (req.multipart && req.formFields?.length) {
    lines.push(`files = {}`);
    lines.push(`data = {}`);
    for (const f of req.formFields) {
      if (f.kind === "file") {
        lines.push(`files["${f.name}"] = open("/path/to/your/file", "rb")`);
      } else if ((f.defaultValue ?? "").trim()) {
        lines.push(`data["${f.name}"] = ${JSON.stringify(f.defaultValue)}`);
      }
    }
    lines.push(
      `response = requests.request("${req.method}", url, params=params, headers=headers, files=files, data=data)`
    );
  } else if (req.body) {
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
export function buildEndpointSnippets(page: EndpointPage, productId = "ctix"): CodeSnippet[] {
  const baseUrl = baseUrlForProduct(productId);
  const req = buildRunnableRequest(page, productId);
  const snippets: CodeSnippet[] = [];

  snippets.push({
    lang: "bash",
    label: "cURL",
    code: curlSnippet(req, baseUrl),
    runKind: "http",
    request: req,
  });

  snippets.push({
    lang: "javascript",
    label: "JavaScript",
    code: jsSnippet(req, baseUrl),
    runKind: "javascript",
  });

  snippets.push({
    lang: "python",
    label: "Python",
    code: pySnippet(req, baseUrl),
    runKind: "python",
  });

  if (req.body && !req.multipart) {
    snippets.push({
      lang: "json",
      label: "Request Body",
      code: req.body,
      runKind: "json",
    });
  }

  if (req.multipart && req.formFields?.length) {
    snippets.push({
      lang: "text",
      label: "Form Fields",
      code: req.formFields
        .map((f) =>
          f.kind === "file"
            ? `${f.name}: (file upload)`
            : `${f.name}: ${f.defaultValue || "(text)"}`
        )
        .join("\n"),
      runKind: "none",
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

export type SnippetLanguage = "curl" | "javascript" | "python";

export function codeForRunnableRequest(
  req: RunnableRequest,
  lang: SnippetLanguage,
  baseUrl: string = DISPLAY_BASE
): string {
  switch (lang) {
    case "curl":
      return curlSnippet(req, baseUrl);
    case "javascript":
      return jsSnippet(req, baseUrl);
    case "python":
      return pySnippet(req, baseUrl);
  }
}
