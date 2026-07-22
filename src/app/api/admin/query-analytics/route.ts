import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { appendEnterpriseAuditEvent } from "@/lib/enterprise/audit";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import {
  classifyAnalyticsQueryError,
  parseAnalyticsFiltersFromParams,
} from "@/lib/query-analytics/filters";
import {
  emptyQueryAnalyticsMetrics,
  exportQueryAnalyticsCsv,
  listQueryAnalyticsEvents,
  summarizeQueryAnalyticsFiltered,
} from "@/lib/query-analytics/repository";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "query_analytics.read");
  if (access instanceof NextResponse) return access;

  const { searchParams } = request.nextUrl;
  const filters = parseAnalyticsFiltersFromParams({
    since: searchParams.get("since"),
    until: searchParams.get("until"),
    productId: searchParams.get("productId"),
    hostname: searchParams.get("hostname"),
    outcome: searchParams.get("outcome"),
  });
  const orgId = access.context.organization.id;
  const sensitive = searchParams.get("sensitive") === "1";
  const timezone = searchParams.get("tz")?.trim() || "UTC";

  if (searchParams.get("export") === "csv") {
    if (sensitive) {
      if (
        !authorizeEnterprise(
          access.context.principal,
          "query_analytics.read_sensitive"
        )
      ) {
        await appendEnterpriseAuditEvent({
          organizationId: orgId,
          actorUserId: access.context.principal.userId,
          action: "query_analytics.sensitive_export",
          resourceType: "query_analytics",
          outcome: "denied",
          correlationId: randomUUID(),
          metadata: { reason: "missing_permission" },
        });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await appendEnterpriseAuditEvent({
        organizationId: orgId,
        actorUserId: access.context.principal.userId,
        action: "query_analytics.sensitive_export",
        resourceType: "query_analytics",
        outcome: "success",
        correlationId: randomUUID(),
        metadata: { filters, timezone },
      });
    } else {
      await appendEnterpriseAuditEvent({
        organizationId: orgId,
        actorUserId: access.context.principal.userId,
        action: "query_analytics.export",
        resourceType: "query_analytics",
        outcome: "success",
        correlationId: randomUUID(),
        metadata: { filters, timezone },
      });
    }

    try {
      const csv = await exportQueryAnalyticsCsv(orgId, filters, {
        timezone,
        sensitive,
      });
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${
            sensitive ? "query-analytics-sensitive.csv" : "query-analytics.csv"
          }"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      const classified = classifyAnalyticsQueryError(err);
      console.error(
        JSON.stringify({
          level: "error",
          message: "query_analytics_export_failed",
          organizationId: orgId,
          code: classified.code,
          error: classified.message,
        })
      );
      return NextResponse.json(
        { error: classified.message, code: classified.code },
        { status: 503 }
      );
    }
  }

  try {
    const [summary, events] = await Promise.all([
      summarizeQueryAnalyticsFiltered(orgId, filters),
      listQueryAnalyticsEvents(orgId, filters, 100),
    ]);

    return NextResponse.json({
      summary,
      events,
      filters,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    const classified = classifyAnalyticsQueryError(err);
    console.error(
      JSON.stringify({
        level: "error",
        message: "query_analytics_api_failed",
        organizationId: orgId,
        code: classified.code,
        error: classified.message,
      })
    );
    return NextResponse.json(
      {
        summary: emptyQueryAnalyticsMetrics(),
        events: [],
        filters,
        refreshedAt: new Date().toISOString(),
        degraded: true,
        error: classified.message,
        code: classified.code,
      },
      { status: 503 }
    );
  }
}
