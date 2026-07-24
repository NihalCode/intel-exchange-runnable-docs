/**
 * Auth0 connection used for login. Okta-only production: AUTH0_OKTA_CONNECTION
 * (Workforce enterprise). Auth0 is a thin broker — Okta owns password + Verify.
 */
export function getOktaBrokerConnection(): string | undefined {
  return process.env.AUTH0_OKTA_CONNECTION?.trim() || undefined;
}

/** True when Auth0 must federate only to Okta (no Database / social). */
export function isOktaBrokerLogin(): boolean {
  return Boolean(getOktaBrokerConnection());
}

/**
 * Connection name forced on /auth/login.
 * Prefer Okta Workforce; legacy Database only when AUTH0_OKTA_CONNECTION is unset.
 */
export function getAuthConnectionOrDefault(): string {
  return (
    getOktaBrokerConnection() ||
    process.env.AUTH0_EMAIL_CONNECTION?.trim() ||
    process.env.AUTH0_DATABASE_CONNECTION?.trim() ||
    "Cyware-Docs-Auth0"
  );
}

/** @deprecated Use getAuthConnectionOrDefault — kept for older tests. */
export function getPasswordConnection(): string | undefined {
  return (
    getOktaBrokerConnection() ||
    process.env.AUTH0_EMAIL_CONNECTION?.trim() ||
    process.env.AUTH0_DATABASE_CONNECTION?.trim() ||
    undefined
  );
}

/** @deprecated Use getAuthConnectionOrDefault */
export function getPasswordConnectionOrDefault(): string {
  return getAuthConnectionOrDefault();
}

export function passwordLoginPath(options?: {
  returnTo?: string;
  forceLogin?: boolean;
  /** Ignored for Okta broker (no Auth0 Database signup screen). */
  signUp?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("connection", getAuthConnectionOrDefault());
  if (options?.returnTo) params.set("returnTo", options.returnTo);
  // Without prompt=login Auth0 resumes SSO and can skip the Okta password prompt.
  const forceLogin = options?.forceLogin !== false;
  if (forceLogin) {
    params.set("prompt", "login");
    params.set("max_age", "0");
  }
  // Never pass Auth0 Database screen_hint when using Okta broker.
  if (options?.signUp && !isOktaBrokerLogin()) {
    params.set("screen_hint", "signup");
  }
  return `/auth/login?${params.toString()}`;
}
