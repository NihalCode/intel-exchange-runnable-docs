import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { appendEnterpriseAuditEvent } from "@/lib/enterprise/audit";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { isProductKey } from "@/lib/products/registry";
import {
  exportQueryAnalyticsCsv,
  listQueryAnalyticsEvents,
  summarizeQueryAnalyticsFiltered,
  type QueryAnalyticsFilters,
} from "@/lib/query-analytics/repository";

export const runtime = "nodejs";

function parseFilters(request: NextRequest): QueryAnalyticsFilters {
  const { searchParams } = request.nextUrl;
  const sinceParam = searchParams.get("since");
  const untilParam = searchParams.get("until");
  const sinceIso =
    sinceParam && !Number.isNaN(Date.parse(sinceParam))
      ? new Date(sinceParam).toISOString()
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const untilIso =
    untilParam && !Number.isNaN(Date.parse(untilParam))
      ? new Date(untilParam).toISOString()
      : undefined;
  const productRaw = searchParams.get("productId")?.trim();
  const hostname = searchParams.get("hostname")?.trim() || undefined;
  const outcome = searchParams.get("outcome")?.trim() || undefined;
  return {
    sinceIso,
    untilIso,
    productId: productRaw && isProductKey(productRaw) ? productRaw : undefined,
    hostname,
    outcome,
  };
}

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "query_analytics.read");
  if (access instanceof NextResponse) return access;

  const filters = parseFilters(request);
  const orgId = access.context.organization.id;
  const sensitive = request.nextUrl.searchParams.get("sensitive") === "1";
  const timezone = request.nextUrl.searchParams.get("tz")?.trim() || "UTC";

  if (request.nextUrl.searchParams.get("export") === "csv") {
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
  }

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
}
