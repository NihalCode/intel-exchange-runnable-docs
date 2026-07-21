import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveUnansweredRealtimeSummaryEnabled } from "@/lib/domains/feature-gates-resolve";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { summarizeUnansweredReviews } from "@/lib/query-analytics/unanswered-intel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aggregate unanswered counts for admin realtime polling.
 * Never includes raw query text, IP, or customer name.
 */
export async function GET(request: NextRequest) {
  let access = await guardEnterpriseApi(request, "unanswered_queries.read");
  if (access instanceof NextResponse) {
    access = await guardEnterpriseApi(request, "query_analytics.read");
    if (access instanceof NextResponse) return access;
  }

  const enabled = await resolveUnansweredRealtimeSummaryEnabled({
    organizationId: access.context.organization.id,
    role: access.context.principal.role,
  });
  if (!enabled) {
    return NextResponse.json(
      { error: "Feature unavailable", code: "FEATURE_DISABLED" },
      { status: 403 }
    );
  }

  const summary = await summarizeUnansweredReviews(access.context.organization.id);
  return NextResponse.json(summary);
}
