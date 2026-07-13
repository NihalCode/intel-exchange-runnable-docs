import { DocumentationAgentApisPage } from "@/components/admin/pages/DocumentationAgentApisPage";
import {
  loadDocsAgentDashboardData,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "resources.read");
  const data = await loadDocsAgentDashboardData(context.organization.id);

  return (
    <DocumentationAgentApisPage
      currentUserId={context.principal.userId}
      capabilities={capabilities}
      resources={data.resources}
      changes={data.changes}
      credentials={data.credentials}
      audit={data.audit}
    />
  );
}
