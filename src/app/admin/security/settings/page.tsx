import { SecuritySettingsPage } from "@/components/admin/pages/SecurityPages";
import {
  loadSecuritySettings,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "security_settings.manage");
  const settings = await loadSecuritySettings(context.organization.id);
  return <SecuritySettingsPage initial={settings} />;
}
