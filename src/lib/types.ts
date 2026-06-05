export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ParamField {
  name: string;
  description?: string;
  isRequired?: boolean;
  value?: string;
  valueType?: string;
  options?: {
    enumValue?: string[];
    xml?: { prefix?: string | null };
    schemaNames?: string[];
  };
  complexItems?: ParamField[];
  items?: ParamField[];
}

export interface RequestSpec {
  query?: ParamField[];
  body?: ParamField[];
  header?: ParamField[];
  path?: ParamField[];
  contentType?: string;
  graphqlQuery?: string;
}

export interface ResponseSpec {
  statusCode?: number;
  description?: string;
  contentType?: string;
  body?: ParamField[];
}

export interface EndpointPage {
  slug: string;
  title: string;
  kind: "endpoint";
  breadcrumb: string[];
  description: string;
  method: HttpMethod;
  path: string;
  request: RequestSpec;
  responses: ResponseSpec[];
  dataExample?: unknown[];
  endpointSummary?: unknown[];
  contentType?: string;
}

export interface SectionPage {
  slug: string;
  title: string;
  kind: "section";
  breadcrumb: string[];
  markdown: string;
  failed?: boolean;
}

export type DocPage = EndpointPage | SectionPage;

export interface NavNode {
  slug: string;
  title: string;
  kind: "endpoint" | "section";
  method: HttpMethod | null;
  children: NavNode[];
}

export interface PageMeta {
  slug: string;
  title: string;
  kind: "endpoint" | "section";
  method: HttpMethod | null;
}

export interface Manifest {
  project: string;
  origin: string;
  generatedAt: string;
  count: number;
  defaultBaseUrl: string;
  pages: PageMeta[];
  nav: NavNode[];
}

export interface KeyValue {
  name: string;
  value: string;
}

/** A structured request that the HTTP runner can execute against a base URL. */
export interface RunnableRequest {
  method: HttpMethod;
  /** Path template relative to base URL; may contain `{param}` segments. */
  path: string;
  /** Values substituted into `{name}` segments in `path`. */
  pathParams?: KeyValue[];
  query: KeyValue[];
  headers: KeyValue[];
  /** JSON (or raw) request body as a string, if any */
  body?: string;
  contentType?: string;
}

/** A single rendered code block on a page. */
export interface CodeSnippet {
  /** language tag for highlighting (curl uses "bash") */
  lang: string;
  /** human label shown in the tab/header */
  label: string;
  /** raw source code */
  code: string;
  /** how the Run control should behave */
  runKind: "http" | "json" | "javascript" | "python" | "none";
  /** structured request for runKind === "http" (avoids re-parsing) */
  request?: RunnableRequest;
}
