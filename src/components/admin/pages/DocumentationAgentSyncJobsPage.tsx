"use client";

import { useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { useControlPlaneMutation } from "@/components/admin/hooks/useControlPlaneMutation";
import { PageHeader, StatusMessage } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { PermissionGate } from "@/components/admin/ui/PermissionGate";
import { buttonPrimaryClass, buttonSecondaryClass } from "@/components/admin/ui/tokens";
import type { BackgroundJobRecord } from "@/lib/enterprise/repository";
import type { EnterprisePermission } from "@/lib/enterprise/types";

interface Props {
  jobs: BackgroundJobRecord[];
  capabilities: EnterprisePermission[];
}

export function DocumentationAgentSyncJobsPage({ jobs, capabilities }: Props) {
  const { organization, hasPermission } = useAdmin();
  const { busy, status, setStatus } = useControlPlaneMutation();
  const [items, setItems] = useState(jobs);
  const canManage = capabilities.includes("jobs.manage");

  async function refreshJobs() {
    const response = await fetch("/api/admin/control-plane/jobs", { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to refresh jobs");
    const result = (await response.json()) as { jobs: BackgroundJobRecord[] };
    setItems(result.jobs);
  }

  async function processJobs() {
    setStatus("Processing due jobs");
    try {
      const contextResponse = await fetch("/api/admin/control-plane/context", {
        cache: "no-store",
      });
      if (!contextResponse.ok) throw new Error("Authorization refresh failed");
      const context = (await contextResponse.json()) as { csrfToken: string };
      const response = await fetch("/api/admin/control-plane/jobs/process", {
        method: "POST",
        headers: { "X-CSRF-Token": context.csrfToken },
      });
      const result = (await response.json()) as {
        error?: string;
        result?: { jobsCompleted: number; scheduledChangesActivated: number };
      };
      if (!response.ok) throw new Error(result.error ?? "Processing failed");
      setStatus(
        result.result
          ? `Processed ${result.result.jobsCompleted} jobs, activated ${result.result.scheduledChangesActivated} changes`
          : "Processing completed"
      );
      await refreshJobs();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Processing failed");
    }
  }

  async function enqueueNoopJob() {
    setStatus("Enqueueing job");
    try {
      const contextResponse = await fetch("/api/admin/control-plane/context", {
        cache: "no-store",
      });
      if (!contextResponse.ok) throw new Error("Authorization refresh failed");
      const context = (await contextResponse.json()) as { csrfToken: string };
      const response = await fetch("/api/admin/control-plane/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": context.csrfToken,
        },
        body: JSON.stringify({ jobType: "noop", payload: {} }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Enqueue failed");
      setStatus("Job enqueued");
      await refreshJobs();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Enqueue failed");
    }
  }

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-jobs-timeline"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Sync Jobs"
        description="Background work timeline — process due jobs and inspect queue state."
        actions={
          canManage ? (
            <PermissionGate permission="jobs.manage" hasPermission={hasPermission}>
              <div className="flex gap-2">
                <LiveStatus label="Queue" tone="signal" />
                <button
                  type="button"
                  className={buttonPrimaryClass}
                  disabled={busy}
                  onClick={() => void processJobs()}
                >
                  Process due jobs
                </button>
                <button
                  type="button"
                  className={buttonSecondaryClass}
                  disabled={busy}
                  onClick={() => void enqueueNoopJob()}
                >
                  Enqueue test job
                </button>
              </div>
            </PermissionGate>
          ) : (
            <LiveStatus label="Read-only" tone="muted" />
          )
        }
      />
      <StatusMessage message={status} />
      <section className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-3">
        <p className="atlas-micro-label text-[var(--atlas-signal)] mb-3">Execution timeline</p>
        <DataTable
          caption="Background sync jobs"
          data={items}
          rowKey={(j) => j.id}
          columns={[
            {
              key: "id",
              header: "Job",
              render: (j) => (
                <span className="font-mono text-xs text-[var(--atlas-text-secondary)]">
                  {j.id.slice(0, 12)}
                </span>
              ),
            },
            {
              key: "type",
              header: "Type",
              sortable: true,
              sortValue: (j) => j.jobType,
              render: (j) => j.jobType,
            },
            {
              key: "status",
              header: "Status",
              render: (j) => <StatusBadge status={j.status} />,
            },
            {
              key: "runAfter",
              header: "Run after",
              sortable: true,
              sortValue: (j) => j.runAfter,
              render: (j) => (
                <time
                  className="font-mono text-[10px] text-[var(--atlas-text-muted)]"
                  dateTime={j.runAfter}
                >
                  {new Date(j.runAfter).toLocaleString()}
                </time>
              ),
            },
            {
              key: "attempts",
              header: "Attempts",
              render: (j) => (
                <span className="font-mono text-xs">
                  {j.attempts}/{j.maxAttempts}
                </span>
              ),
            },
          ]}
          emptyTitle="No background jobs"
        />
      </section>
    </div>
  );
}
