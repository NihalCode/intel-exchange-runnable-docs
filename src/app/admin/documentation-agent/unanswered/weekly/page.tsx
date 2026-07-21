import { UnansweredWeeklyPage } from "@/components/admin/pages/UnansweredWeeklyPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";
import { listWeeklySnapshots } from "@/lib/query-analytics/unanswered-intel";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "query_analytics.read");
  await requireAdminFeature(context.organization.id, "unanswered_query_weekly_analytics");
  const rows = await listWeeklySnapshots(context.organization.id, 100);
  return (
    <UnansweredWeeklyPage rows={rows} refreshedAt={new Date().toISOString()} />
  );
}
