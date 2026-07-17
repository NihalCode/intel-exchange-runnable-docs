import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { validateAuthConfig } from "@/lib/documentation-auth/validate-auth-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, boolean> = {
    database: false,
    authConfig: false,
  };

  try {
    await db.queryOne("SELECT 1 AS ok");
    checks.database = true;
  } catch {
    checks.database = false;
  }

  const auth = validateAuthConfig();
  checks.authConfig = auth.checks.auth0EnvComplete && auth.checks.auth0SecretValid;

  const ready = checks.database && checks.authConfig;
  return NextResponse.json(
    {
      status: ready ? "ready" : "degraded",
      checks,
      authIssues: auth.issues.slice(0, 5),
    },
    { status: ready ? 200 : 503 }
  );
}
