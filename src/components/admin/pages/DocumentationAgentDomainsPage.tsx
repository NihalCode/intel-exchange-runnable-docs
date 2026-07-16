"use client";

import { useState } from "react";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { useControlPlaneMutation } from "@/components/admin/hooks/useControlPlaneMutation";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import type { DomainCollectionMapping } from "@/lib/domains/types";
import { listProducts } from "@/lib/products/registry";

const PRODUCTS = listProducts();

export function DocumentationAgentDomainsPage({
  mappings,
}: {
  mappings: DomainCollectionMapping[];
}) {
  const { organization, hasPermission } = useAdmin();
  const canManage = hasPermission("domains.manage");
  const { mutate, patch, busy, status } = useControlPlaneMutation();

  const [hostname, setHostname] = useState("");
  const [productId, setProductId] = useState(PRODUCTS[0]?.productId ?? "ctix");
  const [environment, setEnvironment] = useState<"production" | "staging" | "development">(
    "production"
  );

  async function createMapping() {
    if (!hostname.trim()) return;
    await mutate(
      "/api/admin/domains",
      {
        hostname: hostname.trim(),
        kind: "product",
        productId,
        environment,
        enabled: true,
      },
      { successMessage: "Domain mapping created" }
    );
    setHostname("");
  }

  async function updateMapping(
    mapping: DomainCollectionMapping,
    patchBody: Record<string, unknown>
  ) {
    await patch(
      "/api/admin/domains",
      {
        id: mapping.id,
        expectedVersion: mapping.version,
        ...patchBody,
      },
      "Domain mapping updated"
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Domains"
        description="Verified custom-domain to product collection mappings."
      />

      {canManage ? (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Add domain mapping</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-70">Hostname</span>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="docs.example.com"
                className="rounded border border-zinc-300 px-2 py-1 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-70">Product</span>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
              >
                {PRODUCTS.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.displayLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-70">Environment</span>
              <select
                value={environment}
                onChange={(e) =>
                  setEnvironment(e.target.value as "production" | "staging" | "development")
                }
                className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
              >
                <option value="production">production</option>
                <option value="staging">staging</option>
                <option value="development">development</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !hostname.trim()}
            onClick={() => void createMapping()}
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Create mapping
          </button>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </section>
      ) : (
        <p className="text-xs text-zinc-500">Read-only view. Domain changes require owner or admin.</p>
      )}

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
                <th className="px-3 py-2">Enabled</th>
                <th className="px-3 py-2">Verification</th>
                <th className="px-3 py-2">TLS</th>
                {canManage ? <th className="px-3 py-2">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-3 py-2 font-mono text-xs">{m.hostname}</td>
                  <td className="px-3 py-2">{m.kind}</td>
                  <td className="px-3 py-2">{m.productId ?? "—"}</td>
                  <td className="px-3 py-2">{m.enabled ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={m.verificationStatus} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={m.tlsStatus} />
                  </td>
                  {canManage ? (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {m.verificationStatus !== "verified" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void updateMapping(m, { verificationStatus: "verified" })
                            }
                            className="rounded border border-emerald-400 px-2 py-0.5 text-emerald-700 dark:text-emerald-400"
                          >
                            Mark verified
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void updateMapping(m, { enabled: !m.enabled })}
                          className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-600"
                        >
                          {m.enabled ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
