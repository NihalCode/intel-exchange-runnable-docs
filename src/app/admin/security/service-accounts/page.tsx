import { SecurityServiceAccountsPage } from "@/components/admin/pages/SecurityPages";
import { requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "credentials.read_metadata");
  return <SecurityServiceAccountsPage />;
}
