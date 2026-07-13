"use client";

import { useMemo, useState } from "react";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { useControlPlaneMutation } from "@/components/admin/hooks/useControlPlaneMutation";
import { PageHeader, StatusMessage } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { SecretCreatedDialog } from "@/components/admin/ui/SecretCreatedDialog";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { PermissionGate } from "@/components/admin/ui/PermissionGate";
import { buttonPrimaryClass, inputClass } from "@/components/admin/ui/tokens";
import type { ApiCredentialMetadata } from "@/lib/enterprise/api-keys";

type SafeCredential = Omit<ApiCredentialMetadata, "keyHash" | "vaultRef">;

export function DocumentationAgentKeysPage({
  credentials,
}: {
  credentials: SafeCredential[];
}) {
  const { organization, selectedEnvironment, hasPermission } = useAdmin();
  const { mutate, busy, status } = useControlPlaneMutation();
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);

  const envCredentials = useMemo(
    () => credentials.filter((c) => c.environment === selectedEnvironment),
    [credentials, selectedEnvironment]
  );

  async function createCredential(formData: FormData) {
    const result = await mutate("/api/admin/control-plane/credentials", {
      name: String(formData.get("name") ?? ""),
      environment: selectedEnvironment,
      expiresAt: null,
    });
    if (result.oneTime && result.plaintext) setOneTimeSecret(result.plaintext);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="API Keys"
        description="Manage control-plane API credentials. Plaintext values are shown once on create or rotate."
      />
      <StatusMessage message={status} />

      <PermissionGate permission="credentials.manage" hasPermission={hasPermission}>
        <form action={createCredential} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            Credential name
            <input className={inputClass} name="name" required maxLength={100} />
          </label>
          <button className={buttonPrimaryClass} disabled={busy} type="submit">
            Create credential
          </button>
        </form>
      </PermissionGate>

      <DataTable
        caption="API keys"
        data={envCredentials}
        rowKey={(c) => c.id}
        searchable
        searchFilter={(c, q) => c.name.toLowerCase().includes(q)}
        columns={[
          { key: "name", header: "Name", sortable: true, sortValue: (c) => c.name, render: (c) => c.name },
          { key: "last4", header: "Ending", render: (c) => <span className="font-mono">••••{c.last4}</span> },
          { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
          {
            key: "actions",
            header: "Actions",
            render: (credential) =>
              hasPermission("credentials.manage") && credential.status === "active" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
                    disabled={busy}
                    onClick={async () => {
                      const result = await mutate(
                        `/api/admin/control-plane/credentials/${credential.id}/rotate`,
                        { expectedVersion: credential.version }
                      );
                      if (result.oneTime && result.plaintext) setOneTimeSecret(result.plaintext);
                    }}
                  >
                    Rotate
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-300 px-2 py-1 text-sm text-red-800 dark:border-red-900 dark:text-red-300"
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        `/api/admin/control-plane/credentials/${credential.id}/revoke`,
                        { expectedVersion: credential.version }
                      )
                    }
                  >
                    Revoke
                  </button>
                </div>
              ) : (
                "—"
              ),
          },
        ]}
        emptyTitle="No API keys"
      />

      <SecretCreatedDialog secret={oneTimeSecret} onClose={() => setOneTimeSecret(null)} />
    </div>
  );
}
