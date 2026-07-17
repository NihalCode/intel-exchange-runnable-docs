import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { buildAuthSetupStatus } from "@/lib/documentation-auth/setup-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public deployment checklist — never returns secret values. */
export async function GET() {
  let databaseConnected = false;
  try {
    await db.queryOne("SELECT 1 AS ok");
    databaseConnected = true;
  } catch {
    databaseConnected = false;
  }

  const status = buildAuthSetupStatus({ databaseConnected });
  return NextResponse.json(status);
}
