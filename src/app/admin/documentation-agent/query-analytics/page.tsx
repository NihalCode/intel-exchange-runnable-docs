import { QueryAnalyticsPage } from "@/components/admin/pages/QueryAnalyticsPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";
import { resolveProductionQueryMetricsEnabled } from "@/lib/domains/feature-gates-resolve";
import {
  classifyAnalyticsQueryError,
  parseAnalyticsFiltersFromParams,
} from "@/lib/query-analytics/filters";
import {
  emptyQueryAnalyticsMetrics,
  listQueryAnalyticsEvents,
  summarizeQueryAnalyticsFiltered,
} from "@/lib/query-analytics/repository";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    since?: string;
    until?: string;
    productId?: string;
    hostname?: string;
  }>;
}) {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "query_analytics.read");
  await requireAdminFeature(context.organization.id, "query_analytics");

  const params = await searchParams;
  const filters = parseAnalyticsFiltersFromParams(params);
  const orgId = context.organization.id;

  let summary = emptyQueryAnalyticsMetrics();
  let recent: Awaited<ReturnType<typeof listQueryAnalyticsEvents>> = [];
  let showProductionMetrics = false;
  let loadError: string | null = null;
  let loadErrorCode: string | null = null;

  try {
    const [summaryResult, recentResult, productionMetrics] = await Promise.all([
      summarizeQueryAnalyticsFiltered(orgId, filters),
      listQueryAnalyticsEvents(orgId, filters, 25),
      resolveProductionQueryMetricsEnabled({
        organizationId: orgId,
        role: context.principal.role,
      }),
    ]);
    summary = summaryResult;
    recent = recentResult;
    showProductionMetrics = productionMetrics;
  } catch (err) {
    const classified = classifyAnalyticsQueryError(err);
    loadError = classified.message;
    loadErrorCode = classified.code;
    console.error(
      JSON.stringify({
        level: "error",
        message: "query_analytics_page_load_failed",
        organizationId: orgId,
        code: loadErrorCode,
        error: loadError,
      })
    );
  }

  return (
    <QueryAnalyticsPage
      summary={summary}
      recent={recent}
      initialSince={filters.sinceIso}
      initialUntil={filters.untilIso ?? new Date().toISOString()}
      initialProductId={filters.productId ?? undefined}
      initialHostname={filters.hostname ?? undefined}
      refreshedAt={new Date().toISOString()}
      showProductionMetrics={showProductionMetrics}
      loadError={loadError}
      loadErrorCode={loadErrorCode}
    />
  );
}
