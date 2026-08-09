"use client";

import { useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { buttonPrimaryClass, buttonSecondaryClass } from "@/components/admin/ui/tokens";
import type { BackgroundJobRecord } from "@/lib/enterprise/repository";
import type { EnterprisePermission } from "@/lib/enterprise/types";

interface Props {
  jobs: BackgroundJobRecord[];
  capabilities: EnterprisePermission[];
}

export function JobsDashboard({ jobs, capabilities }: Props) {
  const [items, setItems] = useState(jobs);
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const canManage = capabilities.includes("jobs.manage");

  async function refreshJobs() {
    const response = await fetch("/api/admin/control-plane/jobs", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Failed to refresh jobs");
    const result = (await response.json()) as { jobs: BackgroundJobRecord[] };
    setItems(result.jobs);
  }

  async function processJobs() {
    setBusy(true);
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
        result?: {
          scheduledChangesActivated: number;
          jobsCompleted: number;
          jobsFailed: number;
          errors: string[];
        };
      };
      if (!response.ok) throw new Error(result.error ?? "Processing failed");
      const summary = result.result;
      setStatus(
        summary
          ? `Processed ${summary.jobsCompleted} jobs, activated ${summary.scheduledChangesActivated} changes`
          : "Processing completed"
      );
      await refreshJobs();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Processing failed");
    } finally {
      setBusy(false);
    }
  }

  async function enqueueNoopJob() {
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="jobs-heading"
      className="space-y-4"
      data-layout="sf-jobs-timeline"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--atlas-line)] pb-3">
        <div>
          <p className="atlas-micro-label text-[var(--atlas-signal)]">Queue</p>
          <h2 id="jobs-heading" className="mt-1 text-lg font-semibold text-[var(--atlas-text)]">
            Background jobs
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveStatus label={busy ? "Busy" : "Idle"} tone={busy ? "amber" : "signal"} />
          {canManage ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>
      <p
        className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--atlas-text-secondary)]"
        role="status"
        aria-live="polite"
      >
        Status: {status}
      </p>
      <div className="sf-table-wrap overflow-x-auto rounded-[var(--radius-sm)]">
        <table className="w-full min-w-[760px] text-left text-sm text-[var(--atlas-text)]">
          <caption className="sr-only">Documentation Agent background jobs</caption>
          <thead>
            <tr>
              <th scope="col" className="p-2">Job</th>
              <th scope="col" className="p-2">Type</th>
              <th scope="col" className="p-2">Status</th>
              <th scope="col" className="p-2">Run after</th>
              <th scope="col" className="p-2">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job) => (
              <tr key={job.id} className="border-t border-[var(--atlas-line)]">
                <td className="p-2 font-mono text-xs text-[var(--atlas-text-secondary)]">
                  {job.id.slice(0, 12)}
                </td>
                <td className="p-2">{job.jobType}</td>
                <td className="p-2">
                  <StatusBadge status={job.status} />
                </td>
                <td className="p-2">
                  <time
                    className="font-mono text-[10px] text-[var(--atlas-text-muted)]"
                    dateTime={job.runAfter}
                  >
                    {new Date(job.runAfter).toLocaleString()}
                  </time>
                </td>
                <td className="p-2 font-mono text-xs">
                  {job.attempts}/{job.maxAttempts}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? (
          <p className="p-3 text-sm text-[var(--atlas-text-muted)]">No background jobs yet.</p>
        ) : null}
      </div>
    </section>
  );
}
