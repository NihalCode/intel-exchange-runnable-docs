/** Parsed Postman collection → internal documentation format. */

export type PostmanAuthType =
  | "none"
  | "apikey"
  | "bearer"
  | "basic"
  | "digest"
  | "oauth1"
  | "oauth2"
  | "hawk"
  | "awsv4"
  | "noauth"
  | "cyware-open-api"
  | "unknown";

export interface PostmanAuthSpec {
  type: PostmanAuthType;
  /** Placeholder env var names, e.g. ACCESS_ID, API_KEY */
  credentialPlaceholders: string[];
  /** Raw Postman auth keys (no secret values) */
  fields: { key: string; placeholder: string }[];
}

export interface ParsedPostmanParam {
  name: string;
  description?: string;
  required: boolean;
  example: string;
  valueType: string;
}

export interface ParsedPostmanResponse {
  statusCode: number;
  name: string;
  contentType: string;
  bodyPreview: string;
}

export type EndpointRunnableStatus =
  | "docs_only_available"
  | "runnable_with_developer_credentials"
  | "blocked_missing_credentials"
  | "blocked_missing_developer_access";

export interface ParsedPostmanEndpoint {
  apiName: string;
  collectionName: string;
  folderPath: string[];
  endpointName: string;
  slug: string;
  method: string;
  path: string;
  baseUrlPlaceholder: string;
  query: ParsedPostmanParam[];
  headers: ParsedPostmanParam[];
  pathParams: ParsedPostmanParam[];
  bodyFields: ParsedPostmanParam[];
  contentType: string;
  description: string;
  auth: PostmanAuthSpec;
  responses: ParsedPostmanResponse[];
  credentialPlaceholders: string[];
  runnableStatus: EndpointRunnableStatus;
}

export interface ParsedPostmanSection {
  slug: string;
  title: string;
  breadcrumb: string[];
  markdown: string;
}

export interface ParsedPostmanCollection {
  collectionName: string;
  productId: string;
  rootSlug: string;
  baseUrlVariables: string[];
  collectionAuth: PostmanAuthSpec;
  credentialPlaceholders: string[];
  sections: ParsedPostmanSection[];
  endpoints: ParsedPostmanEndpoint[];
}
