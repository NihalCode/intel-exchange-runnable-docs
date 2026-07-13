import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listEnterpriseAuditEvents } from "@/lib/enterprise/audit";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { controlPlaneJson } from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "audit.read");
  if (access instanceof NextResponse) return access;
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 200) : 100;
  const events = await listEnterpriseAuditEvents(
    access.context.organization.id,
    limit
  );
  return controlPlaneJson({ events });
}
