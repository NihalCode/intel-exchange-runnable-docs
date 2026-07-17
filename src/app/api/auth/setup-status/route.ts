import { NextResponse } from "next/server";

import { getAuth0, getAuth0ConstructionError } from "@/lib/auth0";
import { buildAuthRuntimeStatus } from "@/lib/documentation-auth/auth-runtime-status";
import { probeDatabase } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public deployment checklist — never returns secret values. */
export async function GET(request: Request) {
  const db = await probeDatabase();
  const client = getAuth0();
  const constructionError = getAuth0ConstructionError();
  const origin = new URL(request.url).origin;

  const status = buildAuthRuntimeStatus({
    databaseConnected: db.connected,
    databaseReasonCode: db.reasonCode,
    clientConstructionSucceeded: Boolean(client),
    clientErrorCode: client
      ? undefined
      : constructionError
        ? "AUTH_CLIENT_CONSTRUCTION_FAILED"
        : undefined,
    currentRequestOrigin: origin,
  });

  return NextResponse.json({
    authReady: status.ready,
    correlationId: status.correlationId,
    deployment: status.deployment,
    env: status.env,
    normalized: status.normalized,
    client: status.client,
    database: {
      configured: db.configured,
      connected: db.connected,
      reasonCode: db.reasonCode,
      safeMessage: db.safeMessage,
      migrationVersion: db.migrationVersion,
    },
    reasonCodes: status.reasonCodes,
    issues: status.reasonCodes
      .filter((code) => code !== "AUTH_READY")
      .map((code) => {
        if (code === "AUTH_DATABASE_UNAVAILABLE") {
          return db.safeMessage ?? "Database unavailable.";
        }
        if (code === "AUTH_BASE_URL_MISMATCH") {
          return `APP_BASE_URL (${status.normalized.appBaseOrigin}) does not match request origin (${status.normalized.currentRequestOrigin}).`;
        }
        return code;
      }),
    missingForSignIn: [
      !status.env.issuerPresent ? "AUTH0_ISSUER_BASE_URL (or AUTH0_DOMAIN)" : null,
      !status.env.clientIdPresent ? "AUTH0_CLIENT_ID" : null,
      !status.env.clientSecretPresent ? "AUTH0_CLIENT_SECRET" : null,
      !status.env.authSecretPresent
        ? "AUTH0_SECRET"
        : !status.env.authSecretValid
          ? "AUTH0_SECRET (must be 32+ characters)"
          : null,
      !status.env.appBaseUrlPresent
        ? "APP_BASE_URL (or AUTH0_BASE_URL, or VERCEL_URL on Vercel)"
        : null,
    ].filter(Boolean),
    missingRecommended: [
      !status.env.databaseUrlPresent ? "DATABASE_URL" : null,
      !status.env.actionSecretPresent ? "AUTH0_ACTION_SHARED_SECRET" : null,
      !status.env.productIdPresent ? "APP_PRODUCT_ID" : null,
    ].filter(Boolean),
  });
}
