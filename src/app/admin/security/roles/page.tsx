import { SecurityRolesPage } from "@/components/admin/pages/SecurityPages";
import { requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "security_settings.manage");
  return <SecurityRolesPage />;
}
