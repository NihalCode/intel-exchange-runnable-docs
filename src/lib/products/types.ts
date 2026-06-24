import type { HttpMethod } from "../types";

/** Authentication style for a Cyware product API. */
export type AuthType =
  | "ctix-open-api" /** HMAC-SHA1 query: AccessID, Signature, Expires */
  | "orchestrate-open-api" /** Same HMAC pattern as CTIX/Orchestrate */
  | "bearer-token"
  | "api-key-header"
  | "custom";

export type DocsSourceType = "theneo-md" | "postman";

export interface AuthQueryParam {
  name: string;
  placeholder: string;
  description?: string;
}

export interface AuthConfig {
  type: AuthType;
  /** Human-readable auth instructions shown in the UI. */
  description: string;
  /** Query params injected into runnable requests (Open API style). */
  queryParams?: AuthQueryParam[];
  /** Header-based auth (Bearer, API key, etc.). */
  headers?: { name: string; placeholder: string; description?: string }[];
  /** Credential field names the UI should collect (case-insensitive). */
  credentialFields?: string[];
}

export interface ApiProduct {
  productId: string;
  productName: string;
  displayLabel: string;
  description: string;
  docsUrl: string;
  docsReferencePath: string;
  baseApiUrl: string;
  authType: AuthType;
  auth: AuthConfig;
  docsSourceType: DocsSourceType;
  /** Theneo origin host, e.g. https://csapapi.cyware.com */
  docsOrigin: string;
  /** Theneo project slug for llms.txt, e.g. collaborate-api-reference */
  docsProject: string;
  /** Referer header required by some Theneo exports. */
  docsReferer?: string;
  defaultHeaders?: Record<string, string>;
  /** Approved base URL patterns for API execution (SSRF allowlist). */
  allowedBaseUrlPatterns: RegExp[];
  /** Whether docs have been ingested locally. */
  indexed: boolean;
  pageCount?: number;
  endpointCount?: number;
}

export type ContentType =
  | "overview"
  | "endpoint"
  | "auth"
  | "parameter"
  | "requestBody"
  | "response"
  | "codeExample";

export interface ProductDocsChunk {
  id: string;
  productId: string;
  productName: string;
  docsUrl: string;
  slug: string;
  title: string;
  kind: "endpoint" | "section";
  method?: HttpMethod;
  endpointPath?: string;
  sectionTitle?: string;
  sourceUrl: string;
  contentType: ContentType;
  breadcrumb: string[];
  text: string;
  embedding?: number[];
}

export interface ProductSearchResult {
  productId: string;
  productName: string;
  slug: string;
  title: string;
  kind: "endpoint" | "section";
  method?: HttpMethod;
  path?: string;
  score: number;
  excerpt: string;
  sourceUrl: string;
}

export interface ApiExecutionRequest {
  productId: string;
  method: HttpMethod;
  url: string;
  headers?: { name: string; value: string }[];
  body?: string;
}

export interface ApiExecutionResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  error?: string;
}
