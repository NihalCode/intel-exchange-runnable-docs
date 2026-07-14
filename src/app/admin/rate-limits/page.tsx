import { RateLimitsPage } from "@/components/admin/pages/RateLimitsPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "security_settings.manage");
  await requireAdminFeature(context.organization.id, "placeholder_admin_modules");
  return <RateLimitsPage />;
}
