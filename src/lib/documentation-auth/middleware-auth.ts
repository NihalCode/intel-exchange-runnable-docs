import "server-only";

import type { NextRequest } from "next/server";

import { isAuthEnvComplete } from "@/lib/documentation-auth/env";
import { isAuthDisabled } from "@/lib/documentation-auth/config";
import { getAuth0 } from "@/lib/auth0";

function authEnabled(): boolean {
  if (isAuthDisabled()) return false;
  return isAuthEnvComplete();
}

/**
 * Edge-safe Auth0 session probe — no filesystem or user store.
 *
 * This is an AUTHENTICATION gate only: it returns a user whenever a valid
 * Auth0 session is present (identified by `sub`). It intentionally does NOT
 * require `email` here. Email/invite/role AUTHORIZATION is enforced later in
 * the route handler via `getAppSessionResult`, which can also recover the
 * email claim from the ID token when it is absent from the top-level session
 * user object. Requiring email at the edge previously produced a hard 401
 * ("Unauthorized") for genuinely authenticated users whose session user did
 * not surface `email` directly, before the route handler ever ran.
 */
export async function getMiddlewareAuthUser(
  request: NextRequest
): Promise<{ sub: string; email: string | null } | null> {
  const auth0 = getAuth0();
  if (!authEnabled() || !auth0) return null;

  const authSession = await auth0.getSession(request);
  const user = authSession?.user;
  if (!user?.sub) return null;
  return {
    sub: user.sub,
    email: typeof user.email === "string" ? user.email : null,
  };
}

export function isMiddlewareAuthEnabled(): boolean {
  return authEnabled();
}
