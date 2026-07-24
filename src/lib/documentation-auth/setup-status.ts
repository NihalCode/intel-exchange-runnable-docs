import "server-only";

import { cleanEnvValue, normalizeAppBaseUrl } from "@/lib/documentation-auth/auth-config-public";
import { resolveAppBaseUrlFromEnv } from "@/lib/documentation-auth/base-url";
import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";
import { isPostgresConfigured } from "@/lib/db/client";

const SIGN_IN_ENV_KEYS = [
  "AUTH0_ISSUER_BASE_URL",
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "AUTH0_OKTA_CONNECTION",
] as const;

const RECOMMENDED_ENV_KEYS = [
  "DATABASE_URL",
  "INITIAL_OWNER_EMAIL",
  "AUTH0_ACTION_SHARED_SECRET",
  "APP_PRODUCT_ID",
  "VERCEL_TOKEN",
] as const;

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

function envPresent(key: string): boolean {
  return Boolean(cleanEnvValue(process.env[key]));
}

export interface AuthSetupStatus {
  authReady: boolean;
  deployment: {
    hostname: string | null;
    productId: string | null;
    onVercel: boolean;
    resolvedAppBaseUrl: string | null;
  };
  env: Record<string, boolean>;
  database: {
    configured: boolean;
    connected: boolean;
  };
  issues: string[];
  missingForSignIn: string[];
  missingRecommended: string[];
}

export function buildAuthSetupStatus(options?: {
  databaseConnected?: boolean;
}): AuthSetupStatus {
  const domain = auth0DomainFromEnv();
  const clientId = cleanEnvValue(process.env.AUTH0_CLIENT_ID);
  const clientSecret = cleanEnvValue(process.env.AUTH0_CLIENT_SECRET);
  const secret = cleanEnvValue(process.env.AUTH0_SECRET);
  const resolvedAppBaseUrl = resolveAppBaseUrlFromEnv();
  const secretValid = Boolean(secret && secret.length >= 32);

  const authReady = Boolean(
    domain &&
      clientId &&
      clientSecret &&
      secretValid &&
      resolvedAppBaseUrl &&
      envPresent("AUTH0_OKTA_CONNECTION")
  );

  const missingForSignIn: string[] = [];
  if (!domain) {
    missingForSignIn.push("AUTH0_ISSUER_BASE_URL (or AUTH0_DOMAIN)");
  }
  if (!clientId) missingForSignIn.push("AUTH0_CLIENT_ID");
  if (!clientSecret) missingForSignIn.push("AUTH0_CLIENT_SECRET");
  if (!secret) missingForSignIn.push("AUTH0_SECRET");
  else if (!secretValid) missingForSignIn.push("AUTH0_SECRET (must be 32+ characters)");
  if (!resolvedAppBaseUrl) {
    missingForSignIn.push("APP_BASE_URL (or AUTH0_BASE_URL, or VERCEL_URL on Vercel)");
  }
  if (!envPresent("AUTH0_OKTA_CONNECTION")) {
    missingForSignIn.push("AUTH0_OKTA_CONNECTION");
  }

  const missingRecommended: string[] = [];
  for (const key of RECOMMENDED_ENV_KEYS) {
    if (!envPresent(key)) missingRecommended.push(key);
  }

  const issues: string[] = [];
  if (missingForSignIn.length > 0) {
    issues.push(
      `Sign-in blocked: set ${missingForSignIn.join(", ")} on this Vercel project, then redeploy.`
    );
  }
  if (!envPresent("AUTH0_ACTION_SHARED_SECRET")) {
    issues.push(
      "AUTH0_ACTION_SHARED_SECRET is unset — Auth0 Post-Login Action invite checks may fail after sign-in."
    );
  }
  if (process.env.VERCEL && !isPostgresConfigured()) {
    issues.push(
      "DATABASE_URL is unset on Vercel — user/org data is ephemeral. Set shared Postgres on every product project."
    );
  }
  if (process.env.VERCEL && isPostgresConfigured() && options?.databaseConnected === false) {
    issues.push(
      "DATABASE_URL is set but the database connection failed — verify the connection string and SSL settings, then redeploy."
    );
  }
  if (process.env.VERCEL && !envPresent("APP_PRODUCT_ID")) {
    issues.push(
      "APP_PRODUCT_ID is unset — set to ctix, csap, cftr, or orchestrate on each product Vercel project."
    );
  }
  if (process.env.VERCEL && !envPresent("VERCEL_TOKEN")) {
    issues.push(
      "VERCEL_TOKEN is unset — Admin → Deployments cannot register Vercel projects until this is set."
    );
  }

  const env: Record<string, boolean> = {};
  for (const key of SIGN_IN_ENV_KEYS) {
    env[key] = envPresent(key);
  }
  for (const key of RECOMMENDED_ENV_KEYS) {
    env[key] = envPresent(key);
  }
  env.APP_BASE_URL = Boolean(normalizeAppBaseUrl(process.env.APP_BASE_URL));
  env.AUTH0_BASE_URL = Boolean(normalizeAppBaseUrl(process.env.AUTH0_BASE_URL));
  env.VERCEL_URL = Boolean(cleanEnvValue(process.env.VERCEL_URL));
  env.AUTH0_SECRET_VALID = secretValid;
  env.resolvedAppBaseUrl = Boolean(resolvedAppBaseUrl);

  return {
    authReady,
    deployment: {
      hostname: cleanEnvValue(process.env.VERCEL_URL),
      productId: resolveAppProductId(),
      onVercel: Boolean(process.env.VERCEL),
      resolvedAppBaseUrl,
    },
    env,
    database: {
      configured: isPostgresConfigured(),
      connected: options?.databaseConnected ?? false,
    },
    issues,
    missingForSignIn,
    missingRecommended,
  };
}
