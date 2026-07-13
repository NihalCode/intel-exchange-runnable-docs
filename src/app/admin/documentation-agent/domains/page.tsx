import { DocumentationAgentDomainsPage } from "@/components/admin/pages/DocumentationAgentDomainsPage";
import { requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "resources.read");
  return <DocumentationAgentDomainsPage />;
}
