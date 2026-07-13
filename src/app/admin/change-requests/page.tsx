import { ChangeRequestsPage } from "@/components/admin/pages/ChangeRequestsPage";
import {
  loadDocsAgentDashboardData,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "changes.create");
  const data = await loadDocsAgentDashboardData(context.organization.id);
  return (
    <ChangeRequestsPage changes={data.changes} resources={data.resources} />
  );
}
