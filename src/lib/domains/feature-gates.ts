/** Deployment-level gates for host routing (server/proxy only — not client authorization). */
export function isDomainRoutingEnabled(): boolean {
  return process.env.DOMAIN_ROUTING_ENABLED === "true";
}

export function isSeparateAdminDomainEnabled(): boolean {
  return (
    process.env.SEPARATE_ADMIN_DOMAIN_ENABLED === "true" ||
    process.env.DOMAIN_ROUTING_ENABLED === "true"
  );
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
