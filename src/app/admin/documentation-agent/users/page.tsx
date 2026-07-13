import { UsersManagementPanel } from "@/components/auth/UsersManagementPanel";
import {
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "admin_dashboard.access");
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Documentation users</h1>
      <p className="mb-6 text-sm text-zinc-500">Provision users directly through Auth0 and manage access lifecycle.</p>
      <UsersManagementPanel />
    </div>
  );
}
