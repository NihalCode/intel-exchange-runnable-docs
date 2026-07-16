import "server-only";

import {
  isDocumentationFeatureEnabled,
  type DocumentationFeatureKey,
} from "@/lib/documentation-features";
import {
  isChatResponseNavigationEnabled,
  isCrossDomainSsoEnabled,
  isCustomSnippetQueryParamsEnabled,
  isDomainRoutingEnabled,
  isQueryAnalyticsEnabled,
  isSeparateAdminDomainEnabled,
} from "@/lib/domains/feature-gates";

type OrgGateInput = {
  organizationId?: string | null;
  role?: string;
  environment?: string;
};

function envOrOrg(
  envEnabled: boolean,
  orgInput: OrgGateInput,
  featureKey: DocumentationFeatureKey
): Promise<boolean> {
  if (envEnabled) return Promise.resolve(true);
  if (!orgInput.organizationId) return Promise.resolve(false);
  return isDocumentationFeatureEnabled({
    organizationId: orgInput.organizationId,
    key: featureKey,
    role: orgInput.role,
    environment: orgInput.environment,
  });
}

/** Proxy routing remains env-only (no org context in middleware). */
export function resolveDomainRoutingEnabled(): boolean {
  return isDomainRoutingEnabled();
}

export async function resolveSeparateAdminDomainEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isSeparateAdminDomainEnabled(), org, "separate_admin_domain");
}

export async function resolveCrossDomainSsoEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isCrossDomainSsoEnabled(), org, "cross_domain_sso");
}

export async function resolveQueryAnalyticsEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isQueryAnalyticsEnabled(), org, "query_analytics");
}

export async function resolveCustomSnippetQueryParamsEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isCustomSnippetQueryParamsEnabled(), org, "custom_snippet_query_parameters");
}

export async function resolveChatResponseNavigationEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isChatResponseNavigationEnabled(), org, "chat_response_navigation");
}

export async function resolveHostBasedProductRoutingEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isDomainRoutingEnabled(), org, "host_based_product_routing");
}
