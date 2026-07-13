import { RateLimitsPage } from "@/components/admin/pages/RateLimitsPage";
import { requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "security_settings.manage");
  return <RateLimitsPage />;
}
