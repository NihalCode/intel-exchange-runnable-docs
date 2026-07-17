import "server-only";

import {
  cleanEnvValue,
  normalizeAppBaseUrl,
} from "@/lib/documentation-auth/auth-config-public";
import { resolveAppBaseUrlFromEnv } from "@/lib/documentation-auth/base-url";

export { cleanEnvValue, normalizeAppBaseUrl } from "@/lib/documentation-auth/auth-config-public";

function auth0DomainFromEnv(): string | null {
  const issuer = cleanEnvValue(process.env.AUTH0_ISSUER_BASE_URL);
  if (issuer) {
    try {
      const host = new URL(issuer.startsWith("http") ? issuer : `https://${issuer}`).hostname;
      return host || null;
    } catch {
      return issuer.replace(/^https?:\/\//, "").replace(/\/+$/, "") || null;
    }
  }
  return cleanEnvValue(process.env.AUTH0_DOMAIN);
}

export interface AuthEnv {
  domain: string | null;
  clientId: string | null;
  clientSecret: string | null;
  secret: string | null;
  appBaseUrl: string | null;
}

export function resolveAppBaseUrlForAuth(): string | null {
  return resolveAppBaseUrlFromEnv();
}

export function getAuthEnv(): AuthEnv {
  return {
    domain: auth0DomainFromEnv(),
    clientId: cleanEnvValue(process.env.AUTH0_CLIENT_ID),
    clientSecret: cleanEnvValue(process.env.AUTH0_CLIENT_SECRET),
    secret: cleanEnvValue(process.env.AUTH0_SECRET),
    appBaseUrl: resolveAppBaseUrlForAuth(),
  };
}

export function isAuthEnvComplete(env: AuthEnv = getAuthEnv()): boolean {
  return Boolean(
    env.domain && env.clientId && env.clientSecret && env.secret && env.appBaseUrl
  );
}

export function validateAuthSecret(secret: string): string | null {
  if (secret.length < 32) {
    return "AUTH0_SECRET must be at least 32 characters.";
  }
  return null;
}

export function authEnvValidationError(env: AuthEnv = getAuthEnv()): string | null {
  if (!isAuthEnvComplete(env)) {
    return "Auth0 requires AUTH0_ISSUER_BASE_URL (or AUTH0_DOMAIN), AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, and APP_BASE_URL (or AUTH0_BASE_URL, or VERCEL_URL on Vercel).";
  }
  return validateAuthSecret(env.secret!);
}

const INITIAL_OWNER_ENV_KEYS = [
  "INITIAL_OWNER_EMAIL",
  "DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL",
  "INITIAL_ADMIN_EMAIL",
] as const;

/** Which env var supplied the initial owner email, if any. */
export function initialOwnerEmailSource(): (typeof INITIAL_OWNER_ENV_KEYS)[number] | null {
  for (const key of INITIAL_OWNER_ENV_KEYS) {
    const raw = cleanEnvValue(process.env[key]);
    if (raw) return key;
  }
  return null;
}

/** Canonical initial owner email — checks INITIAL_OWNER_EMAIL, then legacy aliases. */
export function initialOwnerEmail(): string | null {
  for (const key of INITIAL_OWNER_ENV_KEYS) {
    const raw = cleanEnvValue(process.env[key]);
    if (raw) return raw.trim().toLowerCase();
  }
  return null;
}

/** @deprecated Prefer initialOwnerEmail() — kept for existing imports. */
export function bootstrapOwnerEmail(): string | null {
  return initialOwnerEmail();
}

/** True when email matches the configured initial owner email (case-insensitive). */
export function isInitialOwnerEmail(email: string): boolean {
  const owner = initialOwnerEmail();
  if (!owner) return false;
  return email.trim().toLowerCase() === owner;
}

/** @deprecated Prefer isInitialOwnerEmail() */
export function isBootstrapOwnerEmail(email: string): boolean {
  return isInitialOwnerEmail(email);
}

export function getAppBaseUrl(): string {
  return resolveAppBaseUrlForAuth() ?? "http://localhost:3000";
}

/** Redirect target when Auth0 env is incomplete (browser login flows). */
export function authConfigSignInUrl(message?: string): string {
  const url = new URL("/sign-in", getAppBaseUrl());
  url.searchParams.set("error", "auth_config");
  if (message) url.searchParams.set("message", message.slice(0, 500));
  return url.toString();
}
