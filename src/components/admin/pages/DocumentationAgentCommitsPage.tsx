"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { useControlPlaneMutation } from "@/components/admin/hooks/useControlPlaneMutation";
import { PageHeader, StatusMessage } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { PermissionGate } from "@/components/admin/ui/PermissionGate";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  linkClass,
} from "@/components/admin/ui/tokens";
import type { ProductCommitHistory, CommitHistoryRow } from "@/lib/deployment/commit-history";

type Props = {
  initialProducts: ProductCommitHistory[];
  canPropose: boolean;
  canExecute: boolean;
};

export function DocumentationAgentCommitsPage({
  initialProducts,
  canPropose,
  canExecute,
}: Props) {
  const { organization, selectedEnvironment, hasPermission } = useAdmin();
  const { mutate, busy, status, setStatus } = useControlPlaneMutation();
  const [products, setProducts] = useState(initialProducts);

  const envProducts = useMemo(
    () =>
      products.filter(
        (p) => !selectedEnvironment || p.environment === selectedEnvironment
      ),
    [products, selectedEnvironment]
  );

  async function refresh() {
    const envQuery = selectedEnvironment
      ? `?environment=${encodeURIComponent(selectedEnvironment)}`
      : "";
    const response = await fetch(`/api/admin/deployments/commits${envQuery}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Failed to refresh commits");
    const data = (await response.json()) as { products: ProductCommitHistory[] };
    setProducts(data.products);
  }

  async function requestSwitch(
    product: ProductCommitHistory,
    row: CommitHistoryRow
  ) {
    const from =
      product.commits.find((c) => c.likelyCurrent)?.shortSha ?? "current";
    const ok = window.confirm(
      `Request switch for ${product.product} (${product.environment})?\n\n` +
        `${from} → ${row.shortSha}\n` +
        `${row.message}\n\n` +
        `This creates a change request. An owner/admin must approve in APIs, then Execute.`
    );
    if (!ok) return;

    await mutate(
      `/api/admin/deployments/${product.deploymentId}/commits/switch`,
      {
        mode: "propose",
        proposeOnly: true,
        vercelDeploymentId: row.vercelDeploymentId,
        commitSha: row.meta?.githubCommitSha ?? null,
        fromCommitSha:
          product.commits.find((c) => c.likelyCurrent)?.meta?.githubCommitSha ??
          null,
        url: row.url || null,
      },
      {
        successMessage: "Commit switch requested — approve in APIs, then Execute",
        idempotencyKey: `commit-switch-${product.deploymentId}-${row.vercelDeploymentId}`,
      }
    );
    await refresh().catch(() => undefined);
  }

  async function switchNow(product: ProductCommitHistory, row: CommitHistoryRow) {
    if (product.environment === "production") {
      setStatus("Production requires propose → approve → execute on Commits.");
      return;
    }
    const ok = window.confirm(
      `Switch ${product.product} (${product.environment}) now to ${row.shortSha}?`
    );
    if (!ok) return;
    await mutate(
      `/api/admin/deployments/${product.deploymentId}/commits/switch`,
      {
        mode: "direct",
        vercelDeploymentId: row.vercelDeploymentId,
        commitSha: row.meta?.githubCommitSha ?? null,
        fromCommitSha:
          product.commits.find((c) => c.likelyCurrent)?.meta?.githubCommitSha ??
          null,
        url: row.url || null,
      },
      { successMessage: "Deployment switched" }
    );
    await refresh().catch(() => undefined);
  }

  async function executeApproved(
    product: ProductCommitHistory,
    row: CommitHistoryRow
  ) {
    if (!row.pendingChangeRequestId) return;
    const ok = window.confirm(
      `Execute approved switch to ${row.shortSha} for ${product.product}?`
    );
    if (!ok) return;
    await mutate(
      `/api/admin/deployments/${product.deploymentId}/commits/switch`,
      {
        mode: "execute",
        changeRequestId: row.pendingChangeRequestId,
        vercelDeploymentId: row.vercelDeploymentId,
        commitSha: row.meta?.githubCommitSha ?? null,
        fromCommitSha: row.pendingChangeRequestId ? undefined : null,
        url: row.url || null,
      },
      { successMessage: "Approved commit switch executed" }
    );
    await refresh().catch(() => undefined);
  }

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-commit-pipeline"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Commits"
        description="Deployable GitHub commit history from Vercel (not full GitHub history). Production switches use propose → approve → execute."
        actions={
          <div className="flex items-center gap-2">
            <LiveStatus label={selectedEnvironment} tone="signal" />
            <button
              type="button"
              className={buttonSecondaryClass}
              disabled={busy}
              onClick={() => {
                setStatus("Refreshing");
                void refresh()
                  .then(() => setStatus("Refreshed"))
                  .catch((err) =>
                    setStatus(err instanceof Error ? err.message : "Refresh failed")
                  );
              }}
            >
              Refresh
            </button>
          </div>
        }
      />
      <StatusMessage message={status} />
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--atlas-text-muted)]">
        At most 25 deployments per product.{" "}
        <Link href="/admin/documentation-agent/deployments" className={linkClass}>
          Manage projects & domains
        </Link>
        {" · "}
        <Link href="/admin/documentation-agent/apis" className={linkClass}>
          Approve change requests (APIs)
        </Link>
      </p>

      {envProducts.length === 0 ? (
        <p className="text-sm text-[var(--atlas-text-muted)]">
          No product deployments for this environment. Register a Vercel project under
          Deployments first.
        </p>
      ) : (
        envProducts.map((product) => (
          <section
            key={product.deploymentId}
            className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="atlas-micro-label text-[var(--atlas-signal)]">{product.product}</p>
              <StatusBadge status={product.status} />
              <span className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
                {product.environment} · {product.vercelProjectName} ·{" "}
                {product.vercelProjectIdMasked}
              </span>
            </div>
            {product.error ? (
              <p className="text-xs text-[var(--atlas-danger)]">{product.error}</p>
            ) : null}
            <DataTable
              caption={`${product.product} commit history`}
              data={product.commits}
              rowKey={(row) => row.vercelDeploymentId}
              emptyTitle="No deployments returned from Vercel"
              columns={[
                {
                  key: "status",
                  header: "Status",
                  render: (row) => (
                    <span className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={row.state} />
                      {row.likelyCurrent ? (
                        <StatusBadge status="CURRENT" />
                      ) : null}
                      {row.pendingChangeState ? (
                        <StatusBadge status={row.pendingChangeState} />
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: "commit",
                  header: "Commit",
                  render: (row) =>
                    row.githubUrl ? (
                      <a
                        href={row.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs underline underline-offset-2"
                      >
                        {row.shortSha}
                      </a>
                    ) : (
                      <span className="font-mono text-xs">{row.shortSha}</span>
                    ),
                },
                {
                  key: "message",
                  header: "Message",
                  render: (row) => (
                    <span className="line-clamp-1 text-xs" title={row.message}>
                      {row.message}
                    </span>
                  ),
                },
                {
                  key: "author",
                  header: "Author",
                  render: (row) => <span className="text-xs">{row.author}</span>,
                },
                {
                  key: "ref",
                  header: "Branch",
                  render: (row) => (
                    <span className="font-mono text-xs">{row.ref}</span>
                  ),
                },
                {
                  key: "built",
                  header: "Built",
                  sortable: true,
                  sortValue: (row) => row.createdAt,
                  render: (row) => (
                    <time className="text-xs" dateTime={row.createdAt}>
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleString()
                        : "—"}
                    </time>
                  ),
                },
                {
                  key: "deployment",
                  header: "Deployment",
                  render: (row) => (
                    <span className="font-mono text-[10px]">
                      {row.vercelDeploymentId.slice(0, 12)}…
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  render: (row) => (
                    <div className="flex flex-wrap gap-1">
                      {canPropose && row.switchable ? (
                        <PermissionGate
                          permission="changes.create"
                          hasPermission={hasPermission}
                          fallback={null}
                        >
                          <button
                            type="button"
                            className={buttonSecondaryClass}
                            disabled={busy}
                            onClick={() => void requestSwitch(product, row)}
                          >
                            Request switch
                          </button>
                        </PermissionGate>
                      ) : null}
                      {canExecute &&
                      product.environment !== "production" &&
                      row.switchable ? (
                        <PermissionGate
                          permission="deployments.manage"
                          hasPermission={hasPermission}
                          fallback={null}
                        >
                          <button
                            type="button"
                            className={buttonPrimaryClass}
                            disabled={busy}
                            onClick={() => void switchNow(product, row)}
                          >
                            Switch now
                          </button>
                        </PermissionGate>
                      ) : null}
                      {canExecute &&
                      row.pendingChangeRequestId &&
                      row.pendingChangeState === "APPROVED" ? (
                        <PermissionGate
                          permission="deployments.manage"
                          hasPermission={hasPermission}
                          fallback={null}
                        >
                          <button
                            type="button"
                            className={buttonPrimaryClass}
                            disabled={busy}
                            onClick={() => void executeApproved(product, row)}
                          >
                            Execute approved
                          </button>
                        </PermissionGate>
                      ) : null}
                      {row.pendingChangeRequestId &&
                      row.pendingChangeState === "PENDING_REVIEW" ? (
                        <Link
                          href="/admin/documentation-agent/apis"
                          className="text-[10px] underline underline-offset-2"
                        >
                          Approve in APIs
                        </Link>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </section>
        ))
      )}
    </div>
  );
}
