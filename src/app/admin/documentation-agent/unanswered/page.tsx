import { UnansweredQueriesPage } from "@/components/admin/pages/UnansweredQueriesPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";
import { listUnansweredQueryReviews } from "@/lib/query-analytics/repository";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "query_analytics.read");
  await requireAdminFeature(context.organization.id, "unanswered_query_review");
  const rows = await listUnansweredQueryReviews(context.organization.id, 50);
  return <UnansweredQueriesPage initialRows={rows} />;
}
