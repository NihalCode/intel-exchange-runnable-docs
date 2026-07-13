import { AdminOverviewPage } from "@/components/admin/pages/AdminOverviewPage";
import {
  loadDocsAgentDashboardData,
  requireAdminPageContext,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const { context } = await requireAdminPageContext();
  const { audit } = await loadDocsAgentDashboardData(context.organization.id);

  return <AdminOverviewPage audit={audit} />;
}
