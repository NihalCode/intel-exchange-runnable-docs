"use client";

import { useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { useControlPlaneMutation } from "@/components/admin/hooks/useControlPlaneMutation";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  SignalButton,
  SignalCodeSurface,
  SignalEmptyState,
  SignalInput,
  SignalSelect,
} from "@/components/fabric";
import { listProducts } from "@/lib/products/registry";

type DeploymentRow = {
  id: string;
  product: string;
  vercelProjectName: string;
  vercelProjectIdMasked: string;
  environment: string;
  status: string;
  primaryDomain: string | null;
  approvedCollectionId: string;
  domains: Array<{
    id: string;
    domain: string;
    workflowState: string;
    tlsStatus: string;
    dnsRequirementsJson: string;
    lastProviderError: string | null;
  }>;
  latestDeployment: {
    id: string;
    url: string;
    state: string;
    meta?: { githubCommitSha?: string };
  } | null;
  recentDeployments: Array<{
    id: string;
    url: string;
    state: string;
    meta?: { githubCommitSha?: string };
  }>;
};

export function DocumentationAgentDeploymentsPage({
  initialDeployments,
}: {
  initialDeployments: DeploymentRow[];
}) {
  const { organization, hasPermission } = useAdmin();
  const canManage = hasPermission("deployments.manage");
  const { mutate, busy, status } = useControlPlaneMutation();
  const products = listProducts();

  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [product, setProduct] = useState(products[0]?.productId ?? "ctix");
  const [newDomain, setNewDomain] = useState<Record<string, string>>({});

  async function registerDeployment() {
    await mutate(
      "/api/admin/deployments",
      {
        product,
        vercelProjectId: projectId.trim(),
        vercelProjectName: projectName.trim(),
        environment: "production",
      },
      { successMessage: "Product deployment registered" }
    );
    setProjectId("");
    setProjectName("");
  }

  async function domainAction(
    deploymentId: string,
    domain: string,
    action?: string,
    changeRequestId?: string
  ) {
    await mutate(
      `/api/admin/deployments/${deploymentId}/domains`,
      { domain, action, changeRequestId },
      { successMessage: `Domain ${action ?? "add"} completed` }
    );
  }

  async function deploymentAction(
    deploymentId: string,
    action: "promote" | "rollback",
    vercelDeploymentId?: string
  ) {
    await mutate(
      `/api/admin/deployments/${deploymentId}/promote`,
      { action, vercelDeploymentId },
      { successMessage: action === "rollback" ? "Rollback initiated" : "Deployment promoted" }
    );
  }

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-deploy-topology"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Product deployments"
        description="Pipeline topology — Vercel projects and domain automation, server-side only."
        actions={<LiveStatus label="Topology" tone="signal" />}
      />

      {canManage ? (
        <section className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-signal)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4">
          <p className="atlas-micro-label text-[var(--atlas-signal)]">Register node</p>
          <h2 className="text-sm font-semibold text-[var(--atlas-text)]">Register Vercel project</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <SignalSelect
              label="Product"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.displayLabel}
                </option>
              ))}
            </SignalSelect>
            <SignalInput
              label="Vercel project ID"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="font-mono text-xs"
            />
            <SignalInput
              label="Project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <SignalButton
            type="button"
            disabled={busy || !projectId.trim() || !projectName.trim()}
            loading={busy}
            onClick={() => void registerDeployment()}
          >
            Register deployment
          </SignalButton>
          {status ? (
            <p className="font-mono text-[10px] text-[var(--atlas-text-muted)]">{status}</p>
          ) : null}
        </section>
      ) : null}

      {initialDeployments.length === 0 ? (
        <SignalEmptyState
          title="No product deployments"
          description="No product deployments configured."
        />
      ) : (
        initialDeployments.map((d) => (
          <section
            key={d.id}
            className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="atlas-micro-label text-[var(--atlas-signal)]">{d.product}</p>
              <StatusBadge status={d.status} />
              <span className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
                {d.environment}
              </span>
            </div>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="atlas-micro-label">Vercel project</dt>
                <dd className="mt-0.5 text-[var(--atlas-text)]">{d.vercelProjectName}</dd>
              </div>
              <div>
                <dt className="atlas-micro-label">Project ID</dt>
                <dd className="mt-0.5 font-mono text-[var(--atlas-text-secondary)]">
                  {d.vercelProjectIdMasked}
                </dd>
              </div>
              <div>
                <dt className="atlas-micro-label">Collection</dt>
                <dd className="mt-0.5 font-mono text-[var(--atlas-text-secondary)]">
                  {d.approvedCollectionId}
                </dd>
              </div>
              <div>
                <dt className="atlas-micro-label">Latest deployment</dt>
                <dd className="mt-0.5 font-mono text-[var(--atlas-text-secondary)]">
                  {d.latestDeployment
                    ? `${d.latestDeployment.state} · ${d.latestDeployment.meta?.githubCommitSha?.slice(0, 7) ?? d.latestDeployment.id.slice(0, 8)}`
                    : "—"}
                </dd>
              </div>
            </dl>

            {d.environment === "production" ? (
              <p className="rounded-[var(--radius-sm)] border border-[var(--atlas-amber)] bg-[color-mix(in_srgb,var(--atlas-amber)_10%,transparent)] px-3 py-2 text-xs text-[var(--atlas-text-secondary)]">
                Production domain add/remove/verify may create an approval change request. Commit
                promote/rollback lives on{" "}
                <a
                  href="/admin/documentation-agent/commits"
                  className="text-[var(--atlas-signal)] underline underline-offset-2"
                >
                  Commits
                </a>{" "}
                (propose → approve → execute).
              </p>
            ) : null}

            {d.recentDeployments.length > 0 ? (
              <p className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
                Latest:{" "}
                <span>
                  {d.latestDeployment?.meta?.githubCommitSha?.slice(0, 7) ??
                    d.latestDeployment?.id.slice(0, 8) ??
                    "—"}
                </span>
                {" · "}
                <a
                  href="/admin/documentation-agent/commits"
                  className="text-[var(--atlas-signal)] underline underline-offset-2"
                >
                  View commit history / switch
                </a>
              </p>
            ) : null}

            {canManage && d.environment !== "production" && d.recentDeployments.length > 0 ? (
              <section className="space-y-2 border-t border-[var(--atlas-line)] pt-3">
                <p className="atlas-micro-label text-[var(--atlas-signal)]">
                  Non-prod promote (or use Commits)
                </p>
                <ul className="space-y-1 text-xs">
                  {d.recentDeployments.slice(0, 5).map((dep) => (
                    <li
                      key={dep.id}
                      className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] px-2 py-1.5"
                    >
                      <span className="font-mono text-[var(--atlas-text-secondary)]">
                        {dep.id.slice(0, 12)}…
                      </span>
                      <span>{dep.state}</span>
                      <span className="text-[var(--atlas-text-muted)]">
                        {dep.meta?.githubCommitSha?.slice(0, 7) ?? "—"}
                      </span>
                      <SignalButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void deploymentAction(d.id, "promote", dep.id)}
                      >
                        Promote
                      </SignalButton>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {canManage ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-[var(--atlas-line)] pt-3">
                <SignalInput
                  label="Add domain"
                  value={newDomain[d.id] ?? ""}
                  onChange={(e) =>
                    setNewDomain((prev) => ({ ...prev, [d.id]: e.target.value }))
                  }
                  placeholder="docs.example.com"
                  className="font-mono text-xs"
                />
                <SignalButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy || !(newDomain[d.id] ?? "").trim()}
                  onClick={() => void domainAction(d.id, newDomain[d.id]!.trim())}
                >
                  Import / add domain
                </SignalButton>
              </div>
            ) : null}

            {d.domains.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {d.domains.map((dom) => (
                  <li
                    key={dom.id}
                    className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-operational)] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{dom.domain}</span>
                      <StatusBadge status={dom.workflowState} />
                      <span className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
                        TLS: {dom.tlsStatus}
                      </span>
                    </div>
                    {dom.lastProviderError ? (
                      <p className="mt-1 text-[var(--atlas-danger)]">{dom.lastProviderError}</p>
                    ) : null}
                    {canManage ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <SignalButton
                          type="button"
                          size="sm"
                          variant="toolbar"
                          disabled={busy}
                          onClick={() => void domainAction(d.id, dom.domain, "check-dns")}
                        >
                          Check DNS
                        </SignalButton>
                        <SignalButton
                          type="button"
                          size="sm"
                          variant="toolbar"
                          disabled={busy}
                          onClick={() => void domainAction(d.id, dom.domain, "verify")}
                        >
                          Verify
                        </SignalButton>
                        <SignalButton
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={() => void domainAction(d.id, dom.domain, "remove")}
                        >
                          Remove
                        </SignalButton>
                      </div>
                    ) : null}
                    {dom.dnsRequirementsJson && dom.dnsRequirementsJson !== "[]" ? (
                      <SignalCodeSurface className="mt-2 max-h-24 overflow-auto p-2 font-mono text-[10px]">
                        {dom.dnsRequirementsJson}
                      </SignalCodeSurface>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--atlas-text-muted)]">No domains attached yet.</p>
            )}
          </section>
        ))
      )}
    </div>
  );
}
