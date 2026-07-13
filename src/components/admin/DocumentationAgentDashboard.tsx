"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { EnterpriseAuditEvent } from "@/lib/enterprise/audit";
import type { ChangeRequestRecord, EnterprisePermission } from "@/lib/enterprise/types";
import type {
  ConfigVersionRecord,
  ControlPlaneResourceRecord,
} from "@/lib/enterprise/repository";
import type { ApiCredentialMetadata } from "@/lib/enterprise/api-keys";

type SafeCredential = Omit<ApiCredentialMetadata, "keyHash" | "vaultRef">;
type Resource = ControlPlaneResourceRecord & { versions: ConfigVersionRecord[] };

interface Props {
  organization: { name: string };
  currentUserId: string;
  capabilities: EnterprisePermission[];
  resources: Resource[];
  changes: ChangeRequestRecord[];
  credentials: SafeCredential[];
  audit: EnterpriseAuditEvent[];
}

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-700 dark:bg-zinc-950";
const buttonClass =
  "rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

export function DocumentationAgentDashboard(props: Props) {
  const router = useRouter();
  const capabilities = new Set(props.capabilities);
  const [operation, setOperation] = useState("Ready");
  const [busy, setBusy] = useState(false);

  async function mutate(path: string, body: Record<string, unknown>, idempotencyKey?: string) {
    setBusy(true);
    setOperation("Operation in progress");
    try {
      const contextResponse = await fetch("/api/admin/control-plane/context", {
        cache: "no-store",
      });
      if (!contextResponse.ok) throw new Error("Authorization refresh failed");
      const context = (await contextResponse.json()) as { csrfToken: string };
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": context.csrfToken,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Operation failed");
      setOperation("Operation completed successfully");
      router.refresh();
    } catch (error) {
      setOperation(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }

  async function createResource(formData: FormData) {
    await mutate("/api/admin/control-plane/resources", {
      name: String(formData.get("name") ?? ""),
      environment: String(formData.get("environment") ?? ""),
      resourceType: "docs-agent",
    });
  }

  async function createChange(formData: FormData) {
    try {
      const config = JSON.parse(String(formData.get("config") ?? "{}")) as unknown;
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("Configuration must be a JSON object");
      }
      await mutate(
        "/api/admin/control-plane/changes",
        {
          resourceId: String(formData.get("resourceId") ?? ""),
          config,
          diff: config,
        },
        crypto.randomUUID()
      );
    } catch (error) {
      setOperation(error instanceof Error ? error.message : "Invalid configuration");
    }
  }

  const grouped = ["development", "staging", "production"].map((environment) => ({
    environment,
    resources: props.resources.filter((resource) => resource.environment === environment),
  }));

  return (
    <main className="mx-auto max-w-7xl space-y-10" aria-labelledby="dashboard-title">
      <header>
        <p className="text-sm font-medium text-sky-700 dark:text-sky-300">
          {props.organization.name}
        </p>
        <h1 id="dashboard-title" className="mt-1 text-3xl font-semibold tracking-tight">
          Documentation Agent APIs
        </h1>
        <p className="mt-2 max-w-3xl text-zinc-600 dark:text-zinc-300">
          Manage Documentation Agent resources, controlled configuration changes,
          credential metadata, and organization-scoped audit history.
        </p>
        <p
          className="mt-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          Operation status: {operation}
        </p>
      </header>

      {capabilities.has("resources.write") ? (
        <section aria-labelledby="create-resource-heading">
          <h2 id="create-resource-heading" className="text-xl font-semibold">
            Create API resource
          </h2>
          <form action={createResource} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Resource name
              <input className={inputClass} name="name" required maxLength={100} />
            </label>
            <label className="grid gap-1 text-sm">
              Environment
              <select className={inputClass} name="environment" defaultValue="development">
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option
                  value="production"
                  disabled={!capabilities.has("resources.write_production")}
                >
                  Production
                </option>
              </select>
            </label>
            <button className={buttonClass} disabled={busy} type="submit">
              Create resource
            </button>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="resources-heading">
        <h2 id="resources-heading" className="text-xl font-semibold">
          Resources by environment
        </h2>
        <div className="mt-4 grid gap-5 xl:grid-cols-3">
          {grouped.map((group) => (
            <section
              key={group.environment}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              aria-labelledby={`environment-${group.environment}`}
            >
              <h3
                id={`environment-${group.environment}`}
                className="font-semibold capitalize"
              >
                {group.environment}
              </h3>
              {group.resources.length ? (
                group.resources.map((resource) => (
                  <div key={resource.id} className="mt-4">
                    <h4 className="font-medium">{resource.name}</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      Active version: {resource.activeConfigVersion ?? "None"}
                    </p>
                    <table className="mt-2 w-full text-left text-sm">
                      <caption className="sr-only">
                        Configuration versions for {resource.name}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className="py-1">Version</th>
                          <th scope="col" className="py-1">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resource.versions.map((version) => (
                          <tr key={version.id} className="border-t border-zinc-200 dark:border-zinc-800">
                            <td className="py-1">v{version.versionNumber}</td>
                            <td className="py-1">
                              <time dateTime={version.createdAt}>
                                {new Date(version.createdAt).toLocaleDateString()}
                              </time>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              ) : (
                <p className="mt-3 text-sm text-zinc-500">No resources.</p>
              )}
            </section>
          ))}
        </div>
      </section>

      {capabilities.has("changes.create") && props.resources.length ? (
        <section aria-labelledby="create-change-heading">
          <h2 id="create-change-heading" className="text-xl font-semibold">
            Draft configuration change
          </h2>
          <form action={createChange} className="mt-4 grid max-w-2xl gap-3">
            <label className="grid gap-1 text-sm">
              Resource
              <select className={inputClass} name="resourceId">
                {props.resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name} ({resource.environment})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Configuration JSON
              <textarea
                className={`${inputClass} min-h-28 font-mono`}
                name="config"
                defaultValue={'{\n  "mode": "documentation-agent"\n}'}
                required
              />
            </label>
            <button className={`${buttonClass} justify-self-start`} disabled={busy} type="submit">
              Create draft
            </button>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="changes-heading">
        <h2 id="changes-heading" className="text-xl font-semibold">Change status</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Documentation Agent change requests</caption>
            <thead>
              <tr className="border-b border-zinc-300 dark:border-zinc-700">
                <th scope="col" className="p-2">Request</th>
                <th scope="col" className="p-2">Status</th>
                <th scope="col" className="p-2">Updated</th>
                <th scope="col" className="p-2">Available actions</th>
              </tr>
            </thead>
            <tbody>
              {props.changes.map((change) => (
                <tr key={change.id} className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="p-2 font-mono text-xs">{change.id.slice(0, 12)}</td>
                  <td className="p-2">{change.state.replaceAll("_", " ")}</td>
                  <td className="p-2">
                    <time dateTime={change.updatedAt}>
                      {new Date(change.updatedAt).toLocaleString()}
                    </time>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      {change.state === "DRAFT" && capabilities.has("changes.submit") ? (
                        <ActionButton
                          disabled={busy}
                          label="Submit"
                          onClick={() => mutate(`/api/admin/control-plane/changes/${change.id}/submit`, { expectedVersion: change.version })}
                        />
                      ) : null}
                      {change.state === "PENDING_REVIEW" &&
                      change.requestedByUserId !== props.currentUserId &&
                      capabilities.has("changes.approve") ? (
                        <>
                          <ActionButton disabled={busy} label="Approve" onClick={() => mutate(`/api/admin/control-plane/changes/${change.id}/approve`, { expectedVersion: change.version })} />
                          <ActionButton disabled={busy} label="Reject" onClick={() => mutate(`/api/admin/control-plane/changes/${change.id}/reject`, { expectedVersion: change.version })} />
                        </>
                      ) : null}
                      {change.state === "APPROVED" && capabilities.has("changes.activate") ? (
                        <ActionButton
                          disabled={busy}
                          label="Activate"
                          onClick={() => {
                            const resource = props.resources.find((item) => item.id === change.resourceId);
                            return mutate(`/api/admin/control-plane/changes/${change.id}/activate`, {
                              expectedVersion: change.version,
                              expectedResourceVersion: resource?.version ?? 1,
                            });
                          }}
                        />
                      ) : null}
                      {!["DRAFT", "PENDING_REVIEW", "APPROVED"].includes(change.state) ? (
                        <span>No action available</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="credentials-heading">
        <h2 id="credentials-heading" className="text-xl font-semibold">
          API credential metadata
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Secret values and key hashes are never shown in this dashboard.
        </p>
        <table className="mt-4 w-full text-left text-sm">
          <caption className="sr-only">Organization API credential metadata</caption>
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th scope="col" className="p-2">Name</th>
              <th scope="col" className="p-2">Environment</th>
              <th scope="col" className="p-2">Ending</th>
              <th scope="col" className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {props.credentials.map((credential) => (
              <tr key={credential.id} className="border-b border-zinc-200 dark:border-zinc-800">
                <td className="p-2">{credential.name}</td>
                <td className="p-2 capitalize">{credential.environment}</td>
                <td className="p-2 font-mono">••••{credential.last4}</td>
                <td className="p-2 capitalize">{credential.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="audit-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="audit-heading" className="text-xl font-semibold">Sanitized audit activity</h2>
          <div className="flex gap-2">
            <a className={buttonClass} href="/api/admin/control-plane/export?kind=configuration">
              Export configuration
            </a>
            <a className={buttonClass} href="/api/admin/control-plane/export?kind=audit">
              Export audit
            </a>
          </div>
        </div>
        <ol className="mt-4 space-y-2">
          {props.audit.map((event) => (
            <li key={event.id} className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <span className="font-medium">{event.action}</span>{" "}
              <span>— {event.outcome}</span>
              <time className="ml-2 text-zinc-500" dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      className="rounded border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      disabled={disabled}
      onClick={() => void onClick()}
    >
      {label}
    </button>
  );
}
