import { buildRunnableRequest, codeForRunnableRequest } from "../snippets";
import { applyPathParams, queryStringForRequest } from "../resolve-request";
import { needsCredential } from "../resolve-request";
import { mergeQueryParameters, toKeyValuePairs } from "../merge-query-params";
import type { EndpointPage, KeyValue, RunnableRequest } from "../types";
import type { AgentLanguage, StepParamOverrides } from "./types";

function mergeKeyValues(
  base: KeyValue[],
  overrides: Record<string, string> | undefined,
  skipAuth = false
): KeyValue[] {
  if (!overrides) return base;
  const map = new Map(base.map((kv) => [kv.name, kv.value]));
  for (const [name, value] of Object.entries(overrides)) {
    if (skipAuth && ["AccessID", "Signature", "Expires"].includes(name)) continue;
    map.set(name, value);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

function mergeBody(base: string | undefined, overrides: Record<string, unknown> | undefined): string | undefined {
  if (!overrides || Object.keys(overrides).length === 0) return base;
  let obj: Record<string, unknown> = {};
  if (base) {
    try {
      const parsed = JSON.parse(base);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      /* keep empty */
    }
  }
  obj = { ...obj, ...overrides };
  return JSON.stringify(obj, null, 2);
}

export function applyParamOverrides(
  req: RunnableRequest,
  overrides: StepParamOverrides | undefined
): RunnableRequest {
  if (!overrides) return req;

  const next: RunnableRequest = { ...req };

  if (overrides.path && req.pathParams) {
    next.pathParams = mergeKeyValues(req.pathParams, overrides.path);
  } else if (overrides.path) {
    next.pathParams = Object.entries(overrides.path).map(([name, value]) => ({ name, value }));
  }

  if (overrides.query) {
    const documented = req.query.filter((p) => !needsCredential(p.name, p.value));
    const auth = req.query
      .filter((p) => needsCredential(p.name, p.value))
      .map((p) => ({ ...p, source: "auth" as const }));
    next.query = toKeyValuePairs(
      mergeQueryParameters({
        documented,
        auth,
        valueOverrides: overrides.query,
      })
    );
  }

  if (overrides.body) {
    next.body = mergeBody(req.body, overrides.body);
  }

  if (overrides.form && req.formFields) {
    next.formFields = req.formFields.map((f) => ({
      ...f,
      defaultValue: overrides.form?.[f.name] ?? f.defaultValue,
    }));
  }

  return next;
}

function queryParamsForCode(req: RunnableRequest): string {
  const qs = queryStringForRequest(req);
  return qs.startsWith("?") ? qs.slice(1) : qs;
}

function javaSnippet(req: RunnableRequest, baseUrl: string): string {
  const path = applyPathParams(req.path, req.pathParams);
  const qs = queryParamsForCode(req);
  const url = `${baseUrl}${path}${qs ? `?${qs}` : ""}`;
  const lines = [
    `import java.net.URI;`,
    `import java.net.http.HttpClient;`,
    `import java.net.http.HttpRequest;`,
    `import java.net.http.HttpResponse;`,
    ``,
    `HttpClient client = HttpClient.newHttpClient();`,
    `HttpRequest request = HttpRequest.newBuilder()`,
    `    .uri(URI.create("${url}"))`,
    `    .method("${req.method}", HttpRequest.BodyPublishers${req.body ? `.ofString(${JSON.stringify(req.body)})` : ".noBody()"})`,
  ];
  for (const h of req.headers) {
    if (h.name.toLowerCase() === "content-type") continue;
    lines.push(`    .header("${h.name}", "${h.value}")`);
  }
  lines.push(`    .build();`, `HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());`, `System.out.println(response.statusCode());`, `System.out.println(response.body());`);
  return lines.join("\n");
}

function goSnippet(req: RunnableRequest, baseUrl: string): string {
  const path = applyPathParams(req.path, req.pathParams);
  const qs = queryParamsForCode(req);
  const url = `${baseUrl}${path}${qs ? `?${qs}` : ""}`;
  return [
    `package main`,
    ``,
    `import (`,
    `    "fmt"`,
    `    "io"`,
    `    "net/http"`,
    `    "strings"`,
    `)`,
    ``,
    `func main() {`,
    req.body
      ? `    body := strings.NewReader(\`${req.body}\`)`
      : `    var body io.Reader = nil`,
    `    req, _ := http.NewRequest("${req.method}", "${url}", body)`,
    ...req.headers
      .filter((h) => h.name.toLowerCase() !== "content-type")
      .map((h) => `    req.Header.Set("${h.name}", "${h.value}")`),
    `    resp, err := http.DefaultClient.Do(req)`,
    `    if err != nil { panic(err) }`,
    `    defer resp.Body.Close()`,
    `    b, _ := io.ReadAll(resp.Body)`,
    `    fmt.Println(resp.StatusCode)`,
    `    fmt.Println(string(b))`,
    `}`,
  ].join("\n");
}

export function buildStepRequest(
  page: EndpointPage,
  overrides: StepParamOverrides | undefined,
  productId = "ctix"
): RunnableRequest {
  const base = buildRunnableRequest(page, productId);
  return applyParamOverrides(base, overrides);
}

export function generateStepCode(
  page: EndpointPage,
  overrides: StepParamOverrides | undefined,
  language: AgentLanguage,
  baseUrl: string,
  productId = "ctix"
): { code: string; request: RunnableRequest } {
  const request = buildStepRequest(page, overrides, productId);
  let code: string;
  if (language === "java") {
    code = javaSnippet(request, baseUrl);
  } else if (language === "go") {
    code = goSnippet(request, baseUrl);
  } else {
    code = codeForRunnableRequest(request, language, baseUrl);
  }
  return { code, request };
}
