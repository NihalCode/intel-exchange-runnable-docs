import "server-only";

/** True when Okta Users API can provision invited people from Add user. */
export function isOktaProvisioningConfigured(): boolean {
  return Boolean(getOktaOrgUrl() && getOktaApiToken() && getOktaAppId());
}

/** Branded sign-in is Okta-only when the Auth0 enterprise connection name is set. */
export function isOktaOnlySignIn(): boolean {
  return Boolean(process.env.AUTH0_OKTA_CONNECTION?.trim());
}

export function getOktaOrgUrl(): string | undefined {
  const raw =
    process.env.OKTA_ORG_URL?.trim() ||
    process.env.OKTA_DOMAIN?.trim() ||
    "";
  if (!raw) return undefined;
  const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

export function getOktaApiToken(): string | undefined {
  const token = process.env.OKTA_API_TOKEN?.trim();
  return token || undefined;
}

/** Okta application id for Cyware Docs Auth0 (OIDC app), e.g. `0oa…`. */
export function getOktaAppId(): string | undefined {
  const id = process.env.OKTA_APP_ID?.trim();
  return id || undefined;
}

export function getAuth0OktaConnectionName(): string | undefined {
  const name = process.env.AUTH0_OKTA_CONNECTION?.trim();
  return name || undefined;
}
