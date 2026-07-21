import { UnansweredQueriesPage } from "@/components/admin/pages/UnansweredQueriesPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";
import { resolveUnansweredRealtimeSummaryEnabled } from "@/lib/domains/feature-gates-resolve";
import { listUnansweredQueryReviews } from "@/lib/query-analytics/repository";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "query_analytics.read");
  await requireAdminFeature(context.organization.id, "unanswered_query_review");
  const rows = await listUnansweredQueryReviews(context.organization.id, 50);
  const realtimeEnabled = await resolveUnansweredRealtimeSummaryEnabled({
    organizationId: context.organization.id,
    role: context.principal.role,
  });
  return (
    <UnansweredQueriesPage
      initialRows={rows}
      refreshedAt={new Date().toISOString()}
      realtimeEnabled={realtimeEnabled}
    />
  );
}
