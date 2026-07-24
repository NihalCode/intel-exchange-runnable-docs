/**
 * Auth0 Okta Workforce enterprise connection — required for all authorize requests.
 * Auth0 is a thin broker; Okta owns password + Verify. Never fall back to Database/Google.
 */

/** Trimmed AUTH0_OKTA_CONNECTION, or undefined if unset. */
export function getOktaBrokerConnection(): string | undefined {
  return process.env.AUTH0_OKTA_CONNECTION?.trim() || undefined;
}

/** True when the Okta enterprise connection env is present. */
export function isOktaBrokerLogin(): boolean {
  return Boolean(getOktaBrokerConnection());
}

/**
 * Server-side required connection name for /authorize `connection=`.
 * Throws if unset — callers must not silently omit the parameter.
 */
export function getRequiredOktaConnection(): string {
  const value = getOktaBrokerConnection();
  if (!value) {
    throw new Error("AUTH0_OKTA_CONNECTION is required for authentication.");
  }
  return value;
}

/** Safe presence check for diagnostics (never returns the name). */
export function isOktaConnectionConfigured(): boolean {
  return Boolean(getOktaBrokerConnection());
}

/**
 * Connection forced on every `/auth/login` query.
 * Alias of getRequiredOktaConnection for existing call sites.
 */
export function getAuthConnectionOrDefault(): string {
  return getRequiredOktaConnection();
}

/** @deprecated Prefer getOktaBrokerConnection / getRequiredOktaConnection */
export function getPasswordConnection(): string | undefined {
  return getOktaBrokerConnection();
}

/** @deprecated Prefer getRequiredOktaConnection */
export function getPasswordConnectionOrDefault(): string {
  return getRequiredOktaConnection();
}

/**
 * Branded / fresh-login → Auth0 login with Okta enterprise connection.
 * Does not use Auth0 Database screen_hint=signup.
 */
export function passwordLoginPath(options?: {
  returnTo?: string;
  /** Fresh-login / account switch: force interactive Okta login. Default true. */
  forceLogin?: boolean;
  /** Ignored — Auth0 Database signup is not used. */
  signUp?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("connection", getRequiredOktaConnection());
  if (options?.returnTo) params.set("returnTo", options.returnTo);
  const forceLogin = options?.forceLogin !== false;
  if (forceLogin) {
    params.set("prompt", "login");
    params.set("max_age", "0");
  }
  return `/auth/login?${params.toString()}`;
}
