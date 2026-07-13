import { EnvironmentsPage } from "@/components/admin/pages/EnvironmentsPage";
import { loadDocsAgentResources, requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "resources.read");
  const resources = await loadDocsAgentResources(context.organization.id);
  return <EnvironmentsPage resources={resources} />;
}
