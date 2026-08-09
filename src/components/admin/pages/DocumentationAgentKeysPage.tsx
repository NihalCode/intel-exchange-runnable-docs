"use client";

import { useMemo, useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { useControlPlaneMutation } from "@/components/admin/hooks/useControlPlaneMutation";
import { PageHeader, StatusMessage } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { SecretCreatedDialog } from "@/components/admin/ui/SecretCreatedDialog";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { PermissionGate } from "@/components/admin/ui/PermissionGate";
import {
  buttonDangerClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
} from "@/components/admin/ui/tokens";
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
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-credential-vault"
    >
      <PageHeader
        eyebrow={organization.name}
        title="API Keys"
        description="Vaulted control-plane credentials. Plaintext is shown once on create or rotate."
        actions={<LiveStatus label={selectedEnvironment} tone="amber" />}
      />
      <StatusMessage message={status} />

      <PermissionGate permission="credentials.manage" hasPermission={hasPermission}>
        <form
          action={createCredential}
          className="flex flex-wrap items-end gap-3 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-amber)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4"
        >
          <p className="atlas-micro-label w-full text-[var(--atlas-amber)]">Mint credential</p>
          <label className="grid gap-1 text-sm">
            <span className="atlas-micro-label">Credential name</span>
            <input className={inputClass} name="name" required maxLength={100} />
          </label>
          <button className={buttonPrimaryClass} disabled={busy} type="submit">
            Create credential
          </button>
        </form>
      </PermissionGate>

      <section className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-3">
        <p className="atlas-micro-label text-[var(--atlas-amber)] mb-3">Vault inventory</p>
        <DataTable
          caption="API keys"
          data={envCredentials}
          rowKey={(c) => c.id}
          searchable
          searchFilter={(c, q) => c.name.toLowerCase().includes(q)}
          columns={[
            {
              key: "name",
              header: "Name",
              sortable: true,
              sortValue: (c) => c.name,
              render: (c) => c.name,
            },
            {
              key: "last4",
              header: "Ending",
              render: (c) => (
                <span className="font-mono text-xs text-[var(--atlas-text-secondary)]">
                  ••••{c.last4}
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (c) => <StatusBadge status={c.status} />,
            },
            {
              key: "actions",
              header: "Actions",
              render: (credential) =>
                hasPermission("credentials.manage") && credential.status === "active" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={buttonSecondaryClass}
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
                      className={buttonDangerClass}
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
      </section>

      <SecretCreatedDialog secret={oneTimeSecret} onClose={() => setOneTimeSecret(null)} />
    </div>
  );
}
