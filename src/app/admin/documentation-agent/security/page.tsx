import { notFound } from "next/navigation";

import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { SecuritySettingsForm } from "@/components/admin/SecuritySettingsForm";
import { getAppSession } from "@/lib/documentation-auth/session";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { getSecuritySettings } from "@/lib/enterprise/security-settings";
import { ENTERPRISE_PERMISSIONS } from "@/lib/enterprise/types";

export const dynamic = "force-dynamic";

export default async function DocumentationAgentSecurityPage() {
  const session = await getAppSession();
  if (!session) notFound();
  let context;
  try {
    context = await resolveOrganizationContext(session);
  } catch {
    notFound();
  }
  if (
    !authorizeEnterprise(context.principal, "security_settings.manage", {
      organizationId: context.organization.id,
    })
  ) {
    notFound();
  }
  const settings = await getSecuritySettings(context.organization.id);
  const capabilities = ENTERPRISE_PERMISSIONS.filter((permission) =>
    authorizeEnterprise(context.principal, permission, {
      organizationId: context.organization.id,
    })
  );

  return (
    <main className="mx-auto max-w-4xl space-y-8" aria-labelledby="security-page-title">
      <header>
        <p className="text-sm font-medium text-sky-700 dark:text-sky-300">
          {context.organization.name}
        </p>
        <h1 id="security-page-title" className="mt-1 text-3xl font-semibold tracking-tight">
          Documentation Agent Security
        </h1>
      </header>
      <AdminSubNav capabilities={capabilities} />
      <SecuritySettingsForm initial={settings} />
    </main>
  );
}
