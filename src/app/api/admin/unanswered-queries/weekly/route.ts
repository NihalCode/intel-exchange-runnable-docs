import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveUnansweredWeeklyAnalyticsEnabled } from "@/lib/domains/feature-gates-resolve";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  listWeeklySnapshots,
  weeklySnapshotsToCsv,
} from "@/lib/query-analytics/unanswered-intel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let access = await guardEnterpriseApi(request, "unanswered_queries.read");
  if (access instanceof NextResponse) {
    access = await guardEnterpriseApi(request, "query_analytics.read");
    if (access instanceof NextResponse) return access;
  }

  const organizationId = access.context.organization.id;
  const enabled = await resolveUnansweredWeeklyAnalyticsEnabled({
    organizationId,
    role: access.context.principal.role,
  });
  if (!enabled) {
    return NextResponse.json(
      { error: "Feature unavailable", code: "FEATURE_DISABLED" },
      { status: 403 }
    );
  }

  const rows = await listWeeklySnapshots(organizationId, 100);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const canExport =
      authorizeEnterprise(access.context.principal, "unanswered_queries.export", {
        organizationId,
      }) ||
      authorizeEnterprise(access.context.principal, "query_analytics.read", {
        organizationId,
      });
    if (!canExport) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const csv = weeklySnapshotsToCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="unanswered-weekly.csv"',
      },
    });
  }

  return NextResponse.json({ rows });
}
