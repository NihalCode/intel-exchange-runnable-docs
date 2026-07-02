import { NextResponse, type NextRequest } from "next/server";

import { requirePermission } from "@/lib/documentation-auth/session";
import { listAuditLogs } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await requirePermission("view_audit_logs", request);
  if (session instanceof NextResponse) return session;

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Number.parseInt(limitRaw, 10) || 100, 500) : 100;
  const logs = await listAuditLogs(limit);
  return NextResponse.json({ logs });
}
