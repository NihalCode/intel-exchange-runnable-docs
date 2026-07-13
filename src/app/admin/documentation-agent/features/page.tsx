import { DocumentationFeaturesPage } from "@/components/admin/pages/DocumentationFeaturesPage";
import {
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "features.read");
  return <DocumentationFeaturesPage canManage={capabilities.includes("features.manage")} />;
}
