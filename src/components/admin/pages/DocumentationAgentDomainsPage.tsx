"use client";

import { useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { useControlPlaneMutation } from "@/components/admin/hooks/useControlPlaneMutation";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  SignalButton,
  SignalEmptyState,
  SignalInput,
  SignalSelect,
} from "@/components/fabric";
import type { DomainCollectionMapping } from "@/lib/domains/types";
import { listProducts } from "@/lib/products/registry";

const PRODUCTS = listProducts();

export function DocumentationAgentDomainsPage({
  mappings,
  routingEnabled = true,
}: {
  mappings: DomainCollectionMapping[];
  /** When false, mappings can still be edited; runtime host routing is off. */
  routingEnabled?: boolean;
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
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-testid="admin-domains-page"
      data-layout="sf-verification-map"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Domains"
        description="Verification map — custom hostnames to product documentation collections."
        actions={
          <LiveStatus
            label={routingEnabled ? "Routing on" : "Routing off"}
            tone={routingEnabled ? "signal" : "amber"}
          />
        }
      />

      {!routingEnabled ? (
        <div
          role="status"
          className="rounded-[var(--radius-sm)] border border-[var(--atlas-amber)] bg-[color-mix(in_srgb,var(--atlas-amber)_12%,transparent)] px-4 py-3 text-sm text-[var(--atlas-text)]"
          data-testid="domains-routing-disabled-banner"
        >
          <p className="atlas-micro-label text-[var(--atlas-amber)]">Routing inactive</p>
          <p className="mt-1 font-medium">Host-based product routing is currently off</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--atlas-text-secondary)]">
            You can still create and edit domain mappings here. To activate routing at runtime,
            enable Host-based product routing under Admin → Features, or set{" "}
            <code className="rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] px-1 font-mono text-[10px]">
              DOMAIN_ROUTING_ENABLED=true
            </code>{" "}
            for this deployment.
          </p>
        </div>
      ) : null}

      {canManage ? (
        <section className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-signal)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4">
          <p className="atlas-micro-label text-[var(--atlas-signal)]">Register hostname</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SignalInput
              label="Hostname"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="docs.example.com"
              className="font-mono text-xs"
            />
            <SignalSelect
              label="Product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {PRODUCTS.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.displayLabel}
                </option>
              ))}
            </SignalSelect>
            <SignalSelect
              label="Environment"
              value={environment}
              onChange={(e) =>
                setEnvironment(e.target.value as "production" | "staging" | "development")
              }
            >
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="development">development</option>
            </SignalSelect>
          </div>
          <SignalButton
            type="button"
            disabled={busy || !hostname.trim()}
            loading={busy}
            onClick={() => void createMapping()}
          >
            Create mapping
          </SignalButton>
          {status ? (
            <p className="font-mono text-[10px] text-[var(--atlas-text-muted)]">{status}</p>
          ) : null}
        </section>
      ) : (
        <p className="text-xs text-[var(--atlas-text-muted)]">
          Read-only view. Domain changes require owner or admin.
        </p>
      )}

      {mappings.length === 0 ? (
        <div data-testid="domains-empty">
          <SignalEmptyState
            title="No domain mappings"
            description="No domain mappings configured yet."
          />
        </div>
      ) : (
        <div className="sf-table-wrap overflow-x-auto rounded-[var(--radius-sm)]">
          <table className="min-w-full text-left text-sm text-[var(--atlas-text)]">
            <thead>
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
                <tr key={m.id} className="border-t border-[var(--atlas-line)]">
                  <td className="px-3 py-2 font-mono text-xs">{m.hostname}</td>
                  <td className="px-3 py-2 text-xs">{m.kind}</td>
                  <td className="px-3 py-2 font-mono text-xs">{m.productId ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{m.enabled ? "Yes" : "No"}</td>
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
                          <SignalButton
                            type="button"
                            size="sm"
                            variant="success"
                            disabled={busy}
                            onClick={() =>
                              void updateMapping(m, { verificationStatus: "verified" })
                            }
                          >
                            Mark verified
                          </SignalButton>
                        ) : null}
                        <SignalButton
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void updateMapping(m, { enabled: !m.enabled })}
                        >
                          {m.enabled ? "Disable" : "Enable"}
                        </SignalButton>
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
