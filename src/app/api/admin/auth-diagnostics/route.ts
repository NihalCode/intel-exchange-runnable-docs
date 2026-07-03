import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/documentation-auth/session";
import { validateAuthConfig } from "@/lib/documentation-auth/validate-auth-config";
import { countActiveUsers } from "@/lib/db/repository";
import { getDbBackend, isPostgresConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only safe auth configuration diagnostics (no secrets). */
export async function GET(request: NextRequest) {
  const session = await requirePermission("manage_users", request);
  if (session instanceof NextResponse) return session;

  const config = validateAuthConfig();
  let activeUserCount: number | null = null;
  let databaseReachable = false;

  try {
    activeUserCount = await countActiveUsers();
    databaseReachable = true;
  } catch {
    databaseReachable = false;
  }

  return NextResponse.json({
    ok: config.ok && databaseReachable,
    config,
    runtime: {
      databaseBackend: isPostgresConfigured() ? getDbBackend() : "sqlite",
      databaseReachable,
      activeUserCount,
      vercel: Boolean(process.env.VERCEL),
    },
  });
}
