"use client";

import { useState } from "react";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { useControlPlaneMutation } from "@/components/admin/hooks/useControlPlaneMutation";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
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
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Product deployments"
        description="Vercel project and domain automation — server-side only, no tokens in the browser."
      />

      {canManage ? (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Register Vercel project</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              Product
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              >
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.displayLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Vercel project ID
              <input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Project name
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !projectId.trim() || !projectName.trim()}
            onClick={() => void registerDeployment()}
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Register deployment
          </button>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </section>
      ) : null}

      {initialDeployments.length === 0 ? (
        <p className="text-sm text-zinc-500">No product deployments configured.</p>
      ) : (
        initialDeployments.map((d) => (
          <section
            key={d.id}
            className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold uppercase">{d.product}</h2>
              <StatusBadge status={d.status} />
              <span className="text-xs text-zinc-500">{d.environment}</span>
            </div>
            <dl className="grid gap-1 text-xs sm:grid-cols-2">
              <div>
                <dt className="opacity-60">Vercel project</dt>
                <dd>{d.vercelProjectName}</dd>
              </div>
              <div>
                <dt className="opacity-60">Project ID</dt>
                <dd className="font-mono">{d.vercelProjectIdMasked}</dd>
              </div>
              <div>
                <dt className="opacity-60">Collection</dt>
                <dd className="font-mono">{d.approvedCollectionId}</dd>
              </div>
              <div>
                <dt className="opacity-60">Latest deployment</dt>
                <dd>
                  {d.latestDeployment
                    ? `${d.latestDeployment.state} · ${d.latestDeployment.meta?.githubCommitSha?.slice(0, 7) ?? d.latestDeployment.id.slice(0, 8)}`
                    : "—"}
                </dd>
              </div>
            </dl>

            {d.environment === "production" ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Production domain add/remove/verify may create an approval change request. Access is
                based on your signed-in role (owner/admin) for this session.
              </p>
            ) : null}

            {canManage && d.recentDeployments.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold">Deployment promote / rollback</h3>
                <ul className="space-y-1 text-xs">
                  {d.recentDeployments.map((dep) => (
                    <li key={dep.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{dep.id.slice(0, 12)}…</span>
                      <span>{dep.state}</span>
                      <span className="text-zinc-500">
                        {dep.meta?.githubCommitSha?.slice(0, 7) ?? "—"}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void deploymentAction(d.id, "promote", dep.id)}
                        className="rounded border px-2 py-0.5 dark:border-zinc-600"
                      >
                        Promote
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={busy || d.recentDeployments.length < 2}
                  onClick={() => void deploymentAction(d.id, "rollback")}
                  className="rounded border border-amber-400 px-2 py-1 text-xs text-amber-800 dark:border-amber-700 dark:text-amber-300"
                >
                  Rollback to previous READY deployment
                </button>
              </section>
            ) : null}

            {canManage ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  Add domain
                  <input
                    value={newDomain[d.id] ?? ""}
                    onChange={(e) =>
                      setNewDomain((prev) => ({ ...prev, [d.id]: e.target.value }))
                    }
                    placeholder="docs.example.com"
                    className="rounded border border-zinc-300 px-2 py-1 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
                  />
                </label>
                <button
            type="button"
            disabled={busy || !(newDomain[d.id] ?? "").trim()}
            onClick={() =>
              void domainAction(d.id, newDomain[d.id]!.trim())
            }
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
          >
            Import / add domain
          </button>
              </div>
            ) : null}

            {d.domains.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {d.domains.map((dom) => (
                  <li
                    key={dom.id}
                    className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{dom.domain}</span>
                      <StatusBadge status={dom.workflowState} />
                      <span className="text-zinc-500">TLS: {dom.tlsStatus}</span>
                    </div>
                    {dom.lastProviderError ? (
                      <p className="mt-1 text-red-600 dark:text-red-400">
                        {dom.lastProviderError}
                      </p>
                    ) : null}
                    {canManage ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void domainAction(d.id, dom.domain, "check-dns")}
                          className="rounded border px-2 py-0.5 dark:border-zinc-600"
                        >
                          Check DNS
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void domainAction(d.id, dom.domain, "verify")}
                          className="rounded border px-2 py-0.5 dark:border-zinc-600"
                        >
                          Verify
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void domainAction(d.id, dom.domain, "remove")}
                          className="rounded border border-red-300 px-2 py-0.5 text-red-700 dark:border-red-800 dark:text-red-400"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                    {dom.dnsRequirementsJson && dom.dnsRequirementsJson !== "[]" ? (
                      <pre className="mt-2 max-h-24 overflow-auto rounded bg-zinc-50 p-2 font-mono text-[10px] dark:bg-zinc-900">
                        {dom.dnsRequirementsJson}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-500">No domains attached yet.</p>
            )}
          </section>
        ))
      )}
    </div>
  );
}
