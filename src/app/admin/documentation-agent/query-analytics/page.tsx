import { QueryAnalyticsPage } from "@/components/admin/pages/QueryAnalyticsPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";
import { resolveProductionQueryMetricsEnabled } from "@/lib/domains/feature-gates-resolve";
import { isProductKey } from "@/lib/products/registry";
import {
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
  const nowMs = Date.parse(new Date().toISOString());
  const untilIso = params.until ? new Date(params.until).toISOString() : new Date(nowMs).toISOString();
  const sinceIso = params.since
    ? new Date(params.since).toISOString()
    : new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();
  const productId =
    params.productId && isProductKey(params.productId) ? params.productId : undefined;
  const hostname = params.hostname?.trim() || undefined;

  const filters = { sinceIso, untilIso, productId, hostname };
  const [summary, recent, showProductionMetrics] = await Promise.all([
    summarizeQueryAnalyticsFiltered(context.organization.id, filters),
    listQueryAnalyticsEvents(context.organization.id, filters, 25),
    resolveProductionQueryMetricsEnabled({
      organizationId: context.organization.id,
      role: context.principal.role,
    }),
  ]);

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
    />
  );
}
