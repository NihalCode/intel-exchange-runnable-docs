"use client";

import { useState } from "react";

import type { BackgroundJobRecord } from "@/lib/enterprise/repository";
import type { EnterprisePermission } from "@/lib/enterprise/types";

const buttonClass =
  "rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
    <section aria-labelledby="jobs-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="jobs-heading" className="text-xl font-semibold">
          Background jobs
        </h2>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void processJobs()}
            >
              Process due jobs
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void enqueueNoopJob()}
            >
              Enqueue test job
            </button>
          </div>
        ) : null}
      </div>
      <p
        className="mt-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
        role="status"
        aria-live="polite"
      >
        Status: {status}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Documentation Agent background jobs</caption>
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th scope="col" className="p-2">Job</th>
              <th scope="col" className="p-2">Type</th>
              <th scope="col" className="p-2">Status</th>
              <th scope="col" className="p-2">Run after</th>
              <th scope="col" className="p-2">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job) => (
              <tr key={job.id} className="border-b border-zinc-200 dark:border-zinc-800">
                <td className="p-2 font-mono text-xs">{job.id.slice(0, 12)}</td>
                <td className="p-2">{job.jobType}</td>
                <td className="p-2 capitalize">{job.status}</td>
                <td className="p-2">
                  <time dateTime={job.runAfter}>
                    {new Date(job.runAfter).toLocaleString()}
                  </time>
                </td>
                <td className="p-2">
                  {job.attempts}/{job.maxAttempts}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? (
          <p className="mt-3 text-sm text-zinc-500">No background jobs yet.</p>
        ) : null}
      </div>
    </section>
  );
}
