import type { EndpointPage } from "../types";
import type { EndpointRunnableStatus } from "../postman/types";
import { isLiveApiUiEnabled } from "../public-docs-mode";
import { isDeveloperAccessConfigured } from "./access";
import { readDeveloperCredentialStatus } from "./credential-env";

export interface EndpointRegistryEntry {
  productId: string;
  slug: string;
  title: string;
  method: string;
  path: string;
  baseUrlHint: string;
  authType: string;
  credentialPlaceholders: string[];
  hasRequestBody: boolean;
  hasResponseExamples: boolean;
  runnableStatus: EndpointRunnableStatus;
}

function placeholdersFromPage(page: EndpointPage): string[] {
  const meta = (page as EndpointPage & { postmanMeta?: { credentialPlaceholders?: string[] } })
    .postmanMeta;
  if (meta?.credentialPlaceholders?.length) return meta.credentialPlaceholders;

  const out = new Set<string>();
  const scan = (v: unknown) => {
    if (typeof v !== "string") return;
    for (const m of v.matchAll(/\{\{([^}]+)\}\}/g)) out.add(m[1]!.trim());
    for (const m of v.matchAll(/<([A-Z0-9_]+)>/g)) out.add(m[1]!);
  };
  scan(page.path);
  for (const q of page.request?.query ?? []) scan(q.value);
  for (const h of page.request?.header ?? []) scan(h.value);
  return [...out];
}

export function runnableStatusForEndpoint(
  productId: string,
  page: EndpointPage
): EndpointRunnableStatus {
  const meta = (page as EndpointPage & { postmanMeta?: { runnableStatus?: EndpointRunnableStatus } })
    .postmanMeta;
  if (meta?.runnableStatus) return meta.runnableStatus;

  if (!isLiveApiUiEnabled()) return "docs_only_available";

  if (!isDeveloperAccessConfigured()) return "blocked_missing_developer_access";

  const creds = readDeveloperCredentialStatus(productId);
  if (!creds.complete) return "blocked_missing_credentials";

  const placeholders = placeholdersFromPage(page);
  const needsAuth =
    placeholders.some((p) => /access|secret|signature|token|key/i.test(p)) ||
    (page.request?.query ?? []).some((q) =>
      ["AccessID", "Signature", "Expires"].includes(q.name)
    );

  if (needsAuth && !creds.complete) return "blocked_missing_credentials";
  return "runnable_with_developer_credentials";
}

export function endpointToRegistryEntry(
  productId: string,
  page: EndpointPage,
  baseUrlHint: string
): EndpointRegistryEntry {
  const meta = (page as EndpointPage & {
    postmanMeta?: { auth?: { type?: string }; credentialPlaceholders?: string[] };
  }).postmanMeta;

  return {
    productId,
    slug: page.slug,
    title: page.title,
    method: page.method,
    path: page.path,
    baseUrlHint,
    authType: meta?.auth?.type ?? "cyware-open-api",
    credentialPlaceholders: placeholdersFromPage(page),
    hasRequestBody: Boolean(page.request?.body?.length),
    hasResponseExamples: Boolean(page.responses?.length),
    runnableStatus: runnableStatusForEndpoint(productId, page),
  };
}
