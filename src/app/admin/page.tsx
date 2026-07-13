import { AdminOverviewPage } from "@/components/admin/pages/AdminOverviewPage";
import {
  loadOverviewDashboardData,
  requireAdminPageContext,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const { context } = await requireAdminPageContext();
  const overview = await loadOverviewDashboardData(context.organization.id);

  return <AdminOverviewPage {...overview} />;
}
