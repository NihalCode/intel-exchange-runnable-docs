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

/**
 * Parent cookie Domain (e.g. `.cyninjadev.com`) when cross-domain SSO is enabled.
 * Rejects empty, localhost, and syntactically invalid hostnames so Auth0 session
 * cookies are never minted with a broken Domain attribute.
 */
export function getAuthCookieDomain(): string | undefined {
  if (process.env.CROSS_DOMAIN_SSO_ENABLED !== "true") return undefined;
  const raw = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (!raw) return undefined;
  const normalized = (raw.startsWith(".") ? raw : `.${raw}`).toLowerCase();
  if (normalized === "." || normalized.includes("localhost")) return undefined;
  // Domain cookie value without scheme/path/port; label chars + optional leading dot.
  if (!/^\.(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(normalized)) {
    return undefined;
  }
  return normalized;
}
