import { NextRequest, NextResponse } from "next/server";

import { getAuth0, getAuth0ConstructionError } from "@/lib/auth0";
import { buildAuthRuntimeStatus } from "@/lib/documentation-auth/auth-runtime-status";
import { probeDatabase } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimal public auth readiness — no secrets. */
export async function GET(request: NextRequest) {
  const db = await probeDatabase();
  const client = getAuth0();
  const constructionError = getAuth0ConstructionError();
  const origin = request.nextUrl.origin;

  const status = buildAuthRuntimeStatus({
    databaseConnected: db.connected,
    databaseReasonCode: db.reasonCode,
    clientConstructionSucceeded: Boolean(client),
    clientErrorCode: client
      ? undefined
      : constructionError
        ? "AUTH_CLIENT_CONSTRUCTION_FAILED"
        : "AUTH_ENV_INCOMPLETE",
    currentRequestOrigin: origin,
  });

  return NextResponse.json(
    {
      ready: status.ready,
      databaseReady: db.connected,
      reasonCodes: status.reasonCodes,
      productId: status.deployment.productId,
      correlationId: status.correlationId,
      database: {
        configured: db.configured,
        connected: db.connected,
        reasonCode: db.reasonCode,
        safeMessage: db.safeMessage,
        migrationVersion: db.migrationVersion,
      },
      originMatches: status.normalized.originMatches,
    },
    { status: status.ready ? 200 : 503 }
  );
}
