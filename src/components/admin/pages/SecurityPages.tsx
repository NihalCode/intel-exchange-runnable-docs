"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SecuritySettingsForm } from "@/components/admin/SecuritySettingsForm";
import type { SecuritySettingsRecord } from "@/lib/enterprise/security-settings";

export function SecuritySettingsPage({ initial }: { initial: SecuritySettingsRecord }) {
  const { organization } = useAdmin();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Security Settings"
        description="Organization security policy for Documentation Agent administration."
      />
      <SecuritySettingsForm initial={initial} />
    </div>
  );
}
