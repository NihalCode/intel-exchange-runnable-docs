"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import type { DomainCollectionMapping } from "@/lib/domains/types";

export function DocumentationAgentDomainsPage({
  mappings,
}: {
  mappings: DomainCollectionMapping[];
}) {
  const { organization, hasPermission } = useAdmin();
  const canManage = hasPermission("domains.manage");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Domains"
        description="Verified custom-domain to product collection mappings."
      />
      {!canManage ? (
        <p className="text-xs text-zinc-500">Read-only view. Domain changes require owner or admin.</p>
      ) : null}
      {mappings.length === 0 ? (
        <p className="text-sm text-zinc-500">No domain mappings configured yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Hostname</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Verification</th>
                <th className="px-3 py-2">TLS</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-3 py-2 font-mono text-xs">{m.hostname}</td>
                  <td className="px-3 py-2">{m.kind}</td>
                  <td className="px-3 py-2">{m.productId ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={m.verificationStatus} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={m.tlsStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
