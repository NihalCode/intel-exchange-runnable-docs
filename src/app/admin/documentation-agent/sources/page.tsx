import { DocumentationAgentSourcesPage } from "@/components/admin/pages/DocumentationAgentSourcesPage";
import { requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "resources.read");
  return <DocumentationAgentSourcesPage />;
}
