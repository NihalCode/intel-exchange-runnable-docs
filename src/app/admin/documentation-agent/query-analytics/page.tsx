import { QueryAnalyticsPage } from "@/components/admin/pages/QueryAnalyticsPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";
import { resolveProductionQueryMetricsEnabled } from "@/lib/domains/feature-gates-resolve";
import { isProductKey } from "@/lib/products/registry";
import {
  emptyQueryAnalyticsMetrics,
  listQueryAnalyticsEvents,
  summarizeQueryAnalyticsFiltered,
} from "@/lib/query-analytics/repository";

export const dynamic = "force-dynamic";

function parseIsoParam(raw: string | undefined, fallbackMs: number): string {
  if (!raw?.trim()) return new Date(fallbackMs).toISOString();
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return new Date(fallbackMs).toISOString();
  return new Date(ms).toISOString();
}

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
  const nowMs = Date.now();
  const untilIso = parseIsoParam(params.until, nowMs);
  const sinceIso = parseIsoParam(params.since, nowMs - 30 * 24 * 60 * 60 * 1000);
  const productId =
    params.productId && isProductKey(params.productId) ? params.productId : undefined;
  const hostname = params.hostname?.trim() || undefined;

  const filters = { sinceIso, untilIso, productId, hostname };
  const orgId = context.organization.id;

  let summary = emptyQueryAnalyticsMetrics();
  let recent: Awaited<ReturnType<typeof listQueryAnalyticsEvents>> = [];
  let showProductionMetrics = false;
  let loadError: string | null = null;

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
    loadError = err instanceof Error ? err.message : "analytics_query_failed";
    console.error(
      JSON.stringify({
        level: "error",
        message: "query_analytics_page_load_failed",
        organizationId: orgId,
        error: loadError,
      })
    );
  }

  return (
    <QueryAnalyticsPage
      summary={summary}
      recent={recent}
      initialSince={sinceIso}
      initialUntil={untilIso}
      initialProductId={productId}
      initialHostname={hostname}
      refreshedAt={new Date().toISOString()}
      showProductionMetrics={showProductionMetrics}
      loadError={loadError}
    />
  );
}
