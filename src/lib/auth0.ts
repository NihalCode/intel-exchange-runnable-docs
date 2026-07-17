import { Auth0Client } from "@auth0/nextjs-auth0/server";
import {
  AuthorizationCodeGrantError,
  AuthorizationError,
  InvalidStateError,
  MissingStateError,
} from "@auth0/nextjs-auth0/errors";
import { NextResponse } from "next/server";

import { mapAuthCallbackError } from "@/lib/documentation-auth/auth-callback-errors";
import {
  authConfigFingerprint,
} from "@/lib/documentation-auth/auth-runtime-status";
import {
  authConfigSignInUrl,
  authEnvValidationError,
  getAuthEnv,
  isAuthEnvComplete,
} from "@/lib/documentation-auth/env";
import { isAuthDisabled } from "@/lib/documentation-auth/config";

function loginErrorRedirect(appBaseUrl: string, code: string, message: string): NextResponse {
  const url = new URL("/sign-in", appBaseUrl);
  url.searchParams.set("error", code);
  url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

function safeReturnTo(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
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
    authorizationParameters: {
      scope: "openid profile email",
    },
    onCallback: async (error, ctx) => {
      const appBaseUrl = ctx.appBaseUrl ?? getAuthEnv().appBaseUrl ?? "http://localhost:3000";

      if (error) {
        const mapped = mapAuthCallbackError(error);
        return loginErrorRedirect(appBaseUrl, mapped.code, mapped.message);
      }

      const returnTo = safeReturnTo(ctx.returnTo);
      const destination = new URL("/post-login", appBaseUrl);
      destination.searchParams.set("returnTo", returnTo);
      return NextResponse.redirect(destination);
    },
  });
}

let auth0Client: Auth0Client | null = null;
let auth0Fingerprint: string | null = null;
let lastConstructionError: string | null = null;

/** Lazy Auth0 client — only caches successful construction; retries after config changes. */
export function getAuth0(): Auth0Client | null {
  const fingerprint = authConfigFingerprint();
  if (auth0Client && auth0Fingerprint === fingerprint) {
    return auth0Client;
  }

  auth0Client = null;
  auth0Fingerprint = null;
  lastConstructionError = null;

  if (!authConfigured()) {
    lastConstructionError = authEnvValidationError() ?? "AUTH_ENV_INCOMPLETE";
    return null;
  }

  try {
    auth0Client = createAuth0Client();
    auth0Fingerprint = fingerprint;
    return auth0Client;
  } catch (error) {
    lastConstructionError =
      error instanceof Error ? error.message.slice(0, 200) : "AUTH_CLIENT_CONSTRUCTION_FAILED";
    auth0Client = null;
    auth0Fingerprint = null;
    return null;
  }
}

export function getAuth0ConstructionError(): string | null {
  return lastConstructionError;
}

/** Test helper — clear cached client between cases. */
export function resetAuth0ClientForTests(): void {
  auth0Client = null;
  auth0Fingerprint = null;
  lastConstructionError = null;
}

/** @deprecated Prefer getAuth0() for runtime initialization. */
export const auth0 = {
  get middleware() {
    const client = getAuth0();
    if (!client) {
      return () =>
        NextResponse.redirect(
          authConfigSignInUrl(
            authEnvValidationError() ?? "Auth0 is not configured for this deployment."
          )
        );
    }
    return client.middleware.bind(client);
  },
  async getSession(...args: Parameters<Auth0Client["getSession"]>) {
    const client = getAuth0();
    if (!client) return null;
    return client.getSession(...args);
  },
} as Pick<Auth0Client, "middleware" | "getSession">;

export {
  AuthorizationCodeGrantError,
  AuthorizationError,
  InvalidStateError,
  MissingStateError,
};
