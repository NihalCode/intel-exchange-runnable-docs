import { DocumentationAgentSourcesPage } from "@/components/admin/pages/DocumentationAgentSourcesPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "resources.read");
  await requireAdminFeature(context.organization.id, "placeholder_admin_modules");
  return <DocumentationAgentSourcesPage />;
}
