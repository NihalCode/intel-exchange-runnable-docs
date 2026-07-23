import "server-only";

/**
 * Skip Auth0 Management user create / password tickets on Add user.
 * Only when INVITE_SKIP_IDP_PROVISION is explicitly true.
 * Having AUTH0_OKTA_CONNECTION set alone does NOT skip — so Okta SSO and
 * Cyware email/password (database) invites can both work.
 */
export function shouldSkipIdpProvision(): boolean {
  const explicit = process.env.INVITE_SKIP_IDP_PROVISION?.trim().toLowerCase();
  return explicit === "true" || explicit === "1";
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
