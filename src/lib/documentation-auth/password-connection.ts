import "server-only";

/**
 * Auth0 Username-Password (Database) connection name for the clean email/password UL.
 * Always pass this as `connection=` so Auth0 does not show Google / Okta buttons.
 */
export function getPasswordConnection(): string | undefined {
  return (
    process.env.AUTH0_EMAIL_CONNECTION?.trim() ||
    process.env.AUTH0_DATABASE_CONNECTION?.trim() ||
    undefined
  );
}

/** Default Database connection id used when env is unset (Auth0 default name). */
export function getPasswordConnectionOrDefault(): string {
  return getPasswordConnection() || "Username-Password-Authentication";
}

export function passwordLoginPath(options?: {
  returnTo?: string;
  forceLogin?: boolean;
  /** Auth0 Universal Login signup screen */
  signUp?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("connection", getPasswordConnectionOrDefault());
  if (options?.returnTo) params.set("returnTo", options.returnTo);
  if (options?.forceLogin) {
    params.set("prompt", "login");
    params.set("max_age", "0");
  }
  if (options?.signUp) {
    params.set("screen_hint", "signup");
  }
  return `/auth/login?${params.toString()}`;
}
