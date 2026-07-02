import { Auth0Client } from "@auth0/nextjs-auth0/server";
import {
  AuthorizationCodeGrantError,
  AuthorizationError,
  InvalidStateError,
  MissingStateError,
} from "@auth0/nextjs-auth0/errors";
import { NextResponse } from "next/server";

import {
  authEnvValidationError,
  getAuthEnv,
  isAuthEnvComplete,
} from "@/lib/documentation-auth/env";
import { isAuthDisabled } from "@/lib/documentation-auth/config";

function loginErrorRedirect(appBaseUrl: string, code: string, message?: string): NextResponse {
  const url = new URL("/sign-in", appBaseUrl);
  url.searchParams.set("error", code);
  if (message) {
    url.searchParams.set("message", message);
  }
  return NextResponse.redirect(url);
}

function authConfigured(): boolean {
  if (isAuthDisabled()) return false;
  if (authEnvValidationError()) return false;
  return isAuthEnvComplete();
}

function createAuth0Client(): Auth0Client {
  const env = getAuthEnv();
  const validationError = authEnvValidationError(env);
  if (validationError) {
    throw new Error(validationError);
  }

  return new Auth0Client({
    domain: env.domain!,
    clientId: env.clientId!,
    clientSecret: env.clientSecret!,
    secret: env.secret!,
    appBaseUrl: env.appBaseUrl!,
    enableParallelTransactions: false,
    transactionCookie: {
      maxAge: 60 * 60 * 2,
      sameSite: "lax",
    },
    onCallback: async (error, ctx) => {
      const appBaseUrl = ctx.appBaseUrl ?? getAuthEnv().appBaseUrl ?? "http://localhost:3000";
      if (error) {
        if (error instanceof InvalidStateError || error instanceof MissingStateError) {
          return loginErrorRedirect(
            appBaseUrl,
            "invalid_state",
            "Sign-in could not be verified. Click Continue to start again in this tab."
          );
        }
        if (error instanceof AuthorizationCodeGrantError) {
          return loginErrorRedirect(
            appBaseUrl,
            "auth_failed",
            "Auth0 rejected the login code. Start again — do not reuse an old sign-in link."
          );
        }
        if (error instanceof AuthorizationError) {
          return loginErrorRedirect(
            appBaseUrl,
            "auth_denied",
            error.message || "Sign-in was cancelled or denied."
          );
        }
        return loginErrorRedirect(appBaseUrl, "auth_failed", error.message);
      }
      const destination = new URL(ctx.returnTo || "/", appBaseUrl);
      return NextResponse.redirect(destination);
    },
  });
}

let auth0Client: Auth0Client | null | undefined;

/** Lazy Auth0 client — env vars may be unavailable at module load during build. */
export function getAuth0(): Auth0Client | null {
  if (auth0Client !== undefined) return auth0Client;
  try {
    auth0Client = authConfigured() ? createAuth0Client() : null;
  } catch {
    auth0Client = null;
  }
  return auth0Client;
}

/** @deprecated Prefer getAuth0() for runtime initialization. */
export const auth0 = {
  get middleware() {
    const client = getAuth0();
    if (!client) {
      return () => NextResponse.json({ error: "Auth0 is not configured." }, { status: 503 });
    }
    return client.middleware.bind(client);
  },
  async getSession(...args: Parameters<Auth0Client["getSession"]>) {
    const client = getAuth0();
    if (!client) return null;
    return client.getSession(...args);
  },
} as Pick<Auth0Client, "middleware" | "getSession">;
