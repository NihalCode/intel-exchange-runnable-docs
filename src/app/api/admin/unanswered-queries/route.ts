import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveUnansweredQueryReviewEnabled } from "@/lib/domains/feature-gates-resolve";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { listUnansweredQueryReviews } from "@/lib/query-analytics/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List unanswered query review rows for admin triage.
 * Never includes raw query text or client IP (use GET /:id?sensitive=1).
 */
export async function GET(request: NextRequest) {
  let access = await guardEnterpriseApi(request, "unanswered_queries.read");
  if (access instanceof NextResponse) {
    access = await guardEnterpriseApi(request, "query_analytics.read");
    if (access instanceof NextResponse) return access;
  }

  const organizationId = access.context.organization.id;
  const enabled = await resolveUnansweredQueryReviewEnabled({
    organizationId,
    role: access.context.principal.role,
  });
  if (!enabled) {
    return NextResponse.json(
      { error: "Feature unavailable", code: "FEATURE_DISABLED" },
      { status: 403 }
    );
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const parsed = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50;
  const rows = await listUnansweredQueryReviews(organizationId, limit);
  return NextResponse.json({
    rows,
    refreshedAt: new Date().toISOString(),
  });
}
