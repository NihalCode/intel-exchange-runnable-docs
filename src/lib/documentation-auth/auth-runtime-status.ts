import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { cleanEnvValue, normalizeAppBaseUrl } from "@/lib/documentation-auth/auth-config-public";
import { resolveAppBaseUrlFromEnv } from "@/lib/documentation-auth/base-url";
import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";
import { isPostgresConfigured } from "@/lib/db/client";
import { getAuthEnv, isAuthEnvComplete, validateAuthSecret } from "@/lib/documentation-auth/env";

export type AuthReasonCode =
  | "AUTH_ENV_INCOMPLETE"
  | "AUTH_ENV_INVALID"
  | "AUTH_SECRET_INVALID"
  | "AUTH_CLIENT_CONSTRUCTION_FAILED"
  | "AUTH_BASE_URL_MISMATCH"
  | "AUTH_DATABASE_UNAVAILABLE"
  | "AUTH_DATABASE_NOT_CONFIGURED"
  | "AUTH_ACTION_SECRET_MISSING"
  | "AUTH_PRODUCT_ID_MISSING"
  | "AUTH_READY";

export interface AuthRuntimeStatus {
  ready: boolean;
  correlationId: string;
  deployment: {
    productId: string | null;
    hostname: string | null;
    canonicalOrigin: string | null;
    vercelProductionOrigin: string | null;
    vercelDeploymentOrigin: string | null;
    deploymentId: string | null;
    commitSha: string | null;
    onVercel: boolean;
  };
  env: {
    issuerPresent: boolean;
    clientIdPresent: boolean;
    clientSecretPresent: boolean;
    authSecretPresent: boolean;
    authSecretValid: boolean;
    appBaseUrlPresent: boolean;
    databaseUrlPresent: boolean;
    actionSecretPresent: boolean;
    productIdPresent: boolean;
  };
  normalized: {
    issuerHostname: string | null;
    appBaseOrigin: string | null;
    currentRequestOrigin: string | null;
    originMatches: boolean;
  };
  client: {
    constructionSucceeded: boolean;
    errorCode?: string;
  };
  database: {
    configured: boolean;
    connected: boolean;
    reasonCode?: string;
  };
  reasonCodes: AuthReasonCode[];
}

function issuerHostname(): string | null {
  const issuer = cleanEnvValue(process.env.AUTH0_ISSUER_BASE_URL);
  if (issuer) {
    try {
      return new URL(issuer.startsWith("http") ? issuer : `https://${issuer}`).hostname || null;
    } catch {
      return issuer.replace(/^https?:\/\//, "").replace(/\/+$/, "") || null;
    }
  }
  return cleanEnvValue(process.env.AUTH0_DOMAIN);
}

function vercelHttps(host: string | null | undefined): string | null {
  const clean = cleanEnvValue(host ?? undefined);
  return clean ? `https://${clean.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : null;
}

/** Safe config fingerprint — never includes secret values. */
export function authConfigFingerprint(): string {
  const parts = [
    issuerHostname() ?? "",
    cleanEnvValue(process.env.AUTH0_CLIENT_ID)?.length.toString() ?? "0",
    cleanEnvValue(process.env.AUTH0_CLIENT_SECRET)?.length.toString() ?? "0",
    cleanEnvValue(process.env.AUTH0_SECRET)?.length.toString() ?? "0",
    // Presence only — never include the connection name value.
    cleanEnvValue(process.env.AUTH0_OKTA_CONNECTION) ? "1" : "0",
    resolveAppBaseUrlFromEnv() ?? "",
    resolveAppProductId() ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

export function buildAuthRuntimeStatus(options?: {
  databaseConnected?: boolean;
  databaseReasonCode?: string;
  clientConstructionSucceeded?: boolean;
  clientErrorCode?: string;
  currentRequestOrigin?: string | null;
  correlationId?: string;
}): AuthRuntimeStatus {
  const env = getAuthEnv();
  const secret = env.secret;
  const secretValid = Boolean(secret && !validateAuthSecret(secret));
  const appBaseOrigin = resolveAppBaseUrlFromEnv();
  const requestOrigin = options?.currentRequestOrigin
    ? normalizeAppBaseUrl(options.currentRequestOrigin)
    : null;
  const originMatches = Boolean(
    appBaseOrigin && requestOrigin && appBaseOrigin === requestOrigin
  );

  const envFlags = {
    issuerPresent: Boolean(issuerHostname()),
    clientIdPresent: Boolean(env.clientId),
    clientSecretPresent: Boolean(env.clientSecret),
    authSecretPresent: Boolean(secret),
    authSecretValid: secretValid,
    appBaseUrlPresent: Boolean(appBaseOrigin),
    databaseUrlPresent: isPostgresConfigured(),
    actionSecretPresent: Boolean(cleanEnvValue(process.env.AUTH0_ACTION_SHARED_SECRET)),
    productIdPresent: Boolean(resolveAppProductId()),
  };

  const clientOk =
    options?.clientConstructionSucceeded ??
    (isAuthEnvComplete(env) && secretValid);

  const reasonCodes: AuthReasonCode[] = [];
  if (!envFlags.issuerPresent || !envFlags.clientIdPresent || !envFlags.clientSecretPresent) {
    reasonCodes.push("AUTH_ENV_INCOMPLETE");
  }
  if (envFlags.authSecretPresent && !envFlags.authSecretValid) {
    reasonCodes.push("AUTH_SECRET_INVALID");
  }
  if (!envFlags.appBaseUrlPresent) {
    reasonCodes.push("AUTH_ENV_INCOMPLETE");
  }
  if (requestOrigin && appBaseOrigin && !originMatches) {
    reasonCodes.push("AUTH_BASE_URL_MISMATCH");
  }
  if (!clientOk) {
    reasonCodes.push(
      options?.clientErrorCode === "AUTH_CLIENT_CONSTRUCTION_FAILED"
        ? "AUTH_CLIENT_CONSTRUCTION_FAILED"
        : "AUTH_ENV_INVALID"
    );
  }
  if (!envFlags.databaseUrlPresent) {
    reasonCodes.push("AUTH_DATABASE_NOT_CONFIGURED");
  } else if (options?.databaseConnected === false) {
    reasonCodes.push("AUTH_DATABASE_UNAVAILABLE");
  }
  if (!envFlags.actionSecretPresent) {
    reasonCodes.push("AUTH_ACTION_SECRET_MISSING");
  }
  if (process.env.VERCEL && !envFlags.productIdPresent) {
    reasonCodes.push("AUTH_PRODUCT_ID_MISSING");
  }

  const ready = Boolean(
    clientOk &&
      envFlags.issuerPresent &&
      envFlags.clientIdPresent &&
      envFlags.clientSecretPresent &&
      envFlags.authSecretValid &&
      envFlags.appBaseUrlPresent
  );
  if (ready && reasonCodes.length === 0) {
    reasonCodes.push("AUTH_READY");
  }

  return {
    ready,
    correlationId: options?.correlationId ?? randomUUID(),
    deployment: {
      productId: resolveAppProductId(),
      hostname: cleanEnvValue(process.env.VERCEL_URL),
      canonicalOrigin: appBaseOrigin,
      vercelProductionOrigin: vercelHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL),
      vercelDeploymentOrigin: vercelHttps(process.env.VERCEL_URL),
      deploymentId: cleanEnvValue(process.env.VERCEL_DEPLOYMENT_ID),
      commitSha: cleanEnvValue(process.env.VERCEL_GIT_COMMIT_SHA),
      onVercel: Boolean(process.env.VERCEL),
    },
    env: envFlags,
    normalized: {
      issuerHostname: issuerHostname(),
      appBaseOrigin,
      currentRequestOrigin: requestOrigin,
      originMatches,
    },
    client: {
      constructionSucceeded: clientOk,
      errorCode: options?.clientErrorCode,
    },
    database: {
      configured: envFlags.databaseUrlPresent,
      connected: Boolean(options?.databaseConnected),
      reasonCode: options?.databaseReasonCode,
    },
    reasonCodes: [...new Set(reasonCodes)],
  };
}
