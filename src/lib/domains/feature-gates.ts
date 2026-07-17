import { getStaticDomainConfig } from "@/lib/domains/env-config";

/** Deployment-level gates for host routing (server/proxy only — not client authorization). */
export function isDomainRoutingEnabled(): boolean {
  return process.env.DOMAIN_ROUTING_ENABLED === "true";
}

/** True when admin is hosted on a dedicated ADMIN_DOMAIN (not co-located on product hosts). */
export function isSeparateAdminDomainEnabled(): boolean {
  return process.env.SEPARATE_ADMIN_DOMAIN_ENABLED === "true";
}

/** True when ADMIN_DOMAIN is configured for cross-origin admin redirects. */
export function hasConfiguredAdminDomain(): boolean {
  return Boolean(getStaticDomainConfig().admin?.trim());
}

export function isCrossDomainSsoEnabled(): boolean {
  return process.env.CROSS_DOMAIN_SSO_ENABLED === "true";
}

export function isQueryAnalyticsEnabled(): boolean {
  return process.env.QUERY_ANALYTICS_ENABLED === "true";
}

export function isCustomSnippetQueryParamsEnabled(): boolean {
  return process.env.CUSTOM_SNIPPET_QUERY_PARAMS_ENABLED === "true";
}

export function isChatResponseNavigationEnabled(): boolean {
  return process.env.CHAT_RESPONSE_NAVIGATION_ENABLED === "true";
}
