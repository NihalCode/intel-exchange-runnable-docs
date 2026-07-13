"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { MOCK_ROLES, MOCK_SERVICE_ACCOUNTS, PLACEHOLDER_NOTICE } from "@/lib/admin/mock-data";
import { SecuritySettingsForm } from "@/components/admin/SecuritySettingsForm";
import type { SecuritySettingsRecord } from "@/lib/enterprise/security-settings";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";

export function SecurityRolesPage() {
  const { organization } = useAdmin();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow={organization.name} title="Roles" description="Enterprise role definitions." />
      <p className="text-xs text-amber-700 dark:text-amber-300">{PLACEHOLDER_NOTICE}</p>
      <DataTable
        caption="Roles"
        data={MOCK_ROLES}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Role", sortable: true, sortValue: (r) => r.name, render: (r) => r.name },
          { key: "members", header: "Members", render: (r) => r.members },
          { key: "permissions", header: "Permissions", render: (r) => r.permissions },
          {
            key: "system",
            header: "Type",
            render: (r) => (r.system ? "System" : "Custom"),
          },
        ]}
      />
    </div>
  );
}

export function SecurityServiceAccountsPage() {
  const { organization } = useAdmin();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Service Accounts"
        description="Non-interactive accounts for automation."
      />
      <p className="text-xs text-amber-700 dark:text-amber-300">{PLACEHOLDER_NOTICE}</p>
      <DataTable
        caption="Service accounts"
        data={MOCK_SERVICE_ACCOUNTS}
        rowKey={(a) => a.id}
        columns={[
          { key: "name", header: "Name", render: (a) => a.name },
          { key: "role", header: "Role", render: (a) => a.role },
          {
            key: "status",
            header: "Status",
            render: (a) => <StatusBadge status={a.status} />,
          },
          {
            key: "lastUsed",
            header: "Last used",
            render: (a) =>
              a.lastUsed ? new Date(a.lastUsed).toLocaleString() : "Never",
          },
        ]}
      />
    </div>
  );
}

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
