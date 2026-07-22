import { UnansweredWeeklyPage } from "@/components/admin/pages/UnansweredWeeklyPage";
import { requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";
import { resolveUnansweredWeeklyAnalyticsEnabled } from "@/lib/domains/feature-gates-resolve";
import { listWeeklySnapshots } from "@/lib/query-analytics/unanswered-intel";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "query_analytics.read");
  const weeklyEnabled = await resolveUnansweredWeeklyAnalyticsEnabled({
    organizationId: context.organization.id,
    role: context.principal.role,
  });
  const rows = weeklyEnabled
    ? await listWeeklySnapshots(context.organization.id, 100)
    : [];
  return (
    <UnansweredWeeklyPage
      rows={rows}
      refreshedAt={new Date().toISOString()}
      weeklyEnabled={weeklyEnabled}
    />
  );
}
