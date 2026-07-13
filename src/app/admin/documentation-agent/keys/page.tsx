import { DocumentationAgentKeysPage } from "@/components/admin/pages/DocumentationAgentKeysPage";
import { listApiKeyMetadata } from "@/lib/enterprise/api-keys";
import { requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "credentials.read_metadata");
  const credentials = await listApiKeyMetadata(context.organization.id);
  return <DocumentationAgentKeysPage credentials={credentials} />;
}
