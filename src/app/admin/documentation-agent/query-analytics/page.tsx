import { QueryAnalyticsPage } from "@/components/admin/pages/QueryAnalyticsPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";
import {
  listRecentQueryAnalytics,
  summarizeQueryAnalytics,
} from "@/lib/query-analytics/repository";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "query_analytics.read");
  await requireAdminFeature(context.organization.id, "query_analytics");
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [summary, recent] = await Promise.all([
    summarizeQueryAnalytics(context.organization.id, since),
    listRecentQueryAnalytics(context.organization.id, 25),
  ]);
  return <QueryAnalyticsPage summary={summary} recent={recent} />;
}
