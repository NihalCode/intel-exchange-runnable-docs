import "server-only";

/**
 * @deprecated Auth0 Database skip path removed. Add user always provisions Okta.
 * Kept for diagnostics that still read the env flag; always returns false.
 */
export function shouldSkipIdpProvision(): boolean {
  return false;
}

export function getAuth0OktaConnection(): string | undefined {
  const name = process.env.AUTH0_OKTA_CONNECTION?.trim();
  return name || undefined;
}

/** Parent cookie Domain (e.g. `.cyninjadev.com`) when cross-domain SSO is enabled. */
export function getAuthCookieDomain(): string | undefined {
  if (process.env.CROSS_DOMAIN_SSO_ENABLED !== "true") return undefined;
  const raw = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (!raw) return undefined;
  const normalized = raw.startsWith(".") ? raw : `.${raw}`;
  if (normalized === "." || normalized.includes("localhost")) return undefined;
  return normalized.toLowerCase();
}
