"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { OneTimeSecretModal } from "@/components/admin/OneTimeSecretModal";
import { PageHeader, StatusMessage } from "@/components/admin/ui/PageHeader";
import { useFocusTrap } from "@/components/useFocusTrap";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
} from "@/components/admin/ui/tokens";
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

const buttonClass = buttonPrimaryClass;
const panelClass =
  "rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4";

interface ChangeDetail {
  change: ChangeRequestRecord;
  resource: {
    id: string;
    name: string;
    environment: string;
    activeConfigVersion: number | null;
    version: number;
  };
  targetConfig: {
    id: string;
    versionNumber: number;
    sanitizedDiff: Record<string, unknown>;
  };
  diffVsActive: Record<string, unknown>;
}

export function DocumentationAgentDashboard(props: Props) {
  const router = useRouter();
  const capabilities = new Set(props.capabilities);
  const [operation, setOperation] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [changeDetail, setChangeDetail] = useState<ChangeDetail | null>(null);
  const changeDetailRef = useFocusTrap(
    Boolean(changeDetail),
    () => setChangeDetail(null)
  );
  const [scheduleFor, setScheduleFor] = useState<Record<string, string>>({});
  const [rollbackVersion, setRollbackVersion] = useState<Record<string, string>>({});

  async function getCsrfToken(): Promise<string> {
    const contextResponse = await fetch("/api/admin/control-plane/context", {
      cache: "no-store",
    });
    if (!contextResponse.ok) throw new Error("Authorization refresh failed");
    const context = (await contextResponse.json()) as { csrfToken: string };
    return context.csrfToken;
  }

  async function mutate(path: string, body: Record<string, unknown>, idempotencyKey?: string) {
    setBusy(true);
    setOperation("Operation in progress");
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        error?: string;
        plaintext?: string;
        oneTime?: boolean;
      };
      if (!response.ok) throw new Error(result.error ?? "Operation failed");
      if (result.oneTime && result.plaintext) {
        setOneTimeSecret(result.plaintext);
      }
      setOperation("Operation completed successfully");
      router.refresh();
    } catch (error) {
      setOperation(error instanceof Error ? error.message : "Operation failed");
      throw error;
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

  async function createCredential(formData: FormData) {
    await mutate("/api/admin/control-plane/credentials", {
      name: String(formData.get("name") ?? ""),
      environment: String(formData.get("environment") ?? ""),
      expiresAt: null,
    });
  }

  async function viewChangeDetail(changeId: string) {
    setBusy(true);
    setOperation("Loading change detail");
    try {
      const response = await fetch(`/api/admin/control-plane/changes/${changeId}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as ChangeDetail & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Failed to load change detail");
      setChangeDetail(result);
      setOperation("Change detail loaded");
    } catch (error) {
      setOperation(error instanceof Error ? error.message : "Failed to load change detail");
    } finally {
      setBusy(false);
    }
  }

  const grouped = ["development", "staging", "production"].map((environment) => ({
    environment,
    resources: props.resources.filter((resource) => resource.environment === environment),
  }));

  return (
    <section
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-docs-agent-dashboard"
    >
      <PageHeader
        eyebrow={props.organization.name}
        title="Documentation Agent APIs"
        description="Manage Documentation Agent resources, controlled configuration changes, credential metadata, and organization-scoped audit history."
        actions={<LiveStatus label="Control plane" tone="signal" />}
      />
      <StatusMessage message={`Operation status: ${operation}`} />

      <AdminSubNav capabilities={props.capabilities} />

      {capabilities.has("resources.write") ? (
        <section
          className={`${panelClass} border-l-2 border-l-[var(--atlas-signal)]`}
          aria-labelledby="create-resource-heading"
        >
          <p className="atlas-micro-label text-[var(--atlas-signal)]">Provision</p>
          <h2 id="create-resource-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
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

      <section className={panelClass} aria-labelledby="resources-heading">
        <p className="atlas-micro-label text-[var(--atlas-signal)]">Environment topology</p>
        <h2 id="resources-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
          Resources by environment
        </h2>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {grouped.map((group) => (
            <section
              key={group.environment}
              className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-operational)] p-3"
              aria-labelledby={`environment-${group.environment}`}
            >
              <h3
                id={`environment-${group.environment}`}
                className="atlas-micro-label text-[var(--atlas-signal)]"
              >
                {group.environment}
              </h3>
              {group.resources.length ? (
                group.resources.map((resource) => (
                  <div key={resource.id} className="mt-3 border-t border-[var(--atlas-line)] pt-3">
                    <h4 className="font-medium text-[var(--atlas-text)]">{resource.name}</h4>
                    <p className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
                      Active version: {resource.activeConfigVersion ?? "None"}
                    </p>
                    <table className="mt-2 w-full text-left text-sm text-[var(--atlas-text-secondary)]">
                      <caption className="sr-only">
                        Configuration versions for {resource.name}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className="py-1 text-[10px] uppercase tracking-[0.08em]">Version</th>
                          <th scope="col" className="py-1 text-[10px] uppercase tracking-[0.08em]">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resource.versions.map((version) => (
                          <tr key={version.id} className="border-t border-[var(--atlas-line)]">
                            <td className="py-1 font-mono text-xs">v{version.versionNumber}</td>
                            <td className="py-1 font-mono text-[10px]">
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
                <p className="mt-3 text-sm text-[var(--atlas-text-muted)]">No resources.</p>
              )}
            </section>
          ))}
        </div>
      </section>

      {capabilities.has("changes.create") && props.resources.length ? (
        <section className={panelClass} aria-labelledby="create-change-heading">
          <p className="atlas-micro-label text-[var(--atlas-violet)]">Draft change</p>
          <h2 id="create-change-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
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

      <section className={panelClass} aria-labelledby="changes-heading">
        <p className="atlas-micro-label text-[var(--atlas-violet)]">Change pipeline</p>
        <h2 id="changes-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
          Change status
        </h2>
        <div className="sf-table-wrap mt-4 overflow-x-auto rounded-[var(--radius-sm)]">
          <table className="w-full min-w-[960px] text-left text-sm text-[var(--atlas-text)]">
            <caption className="sr-only">Documentation Agent change requests</caption>
            <thead>
              <tr>
                <th scope="col" className="p-2">Request</th>
                <th scope="col" className="p-2">Status</th>
                <th scope="col" className="p-2">Updated</th>
                <th scope="col" className="p-2">Available actions</th>
              </tr>
            </thead>
            <tbody>
              {props.changes.map((change) => {
                const resource = props.resources.find((item) => item.id === change.resourceId);
                return (
                  <tr key={change.id} className="border-t border-[var(--atlas-line)]">
                    <td className="p-2 font-mono text-xs">{change.id.slice(0, 12)}</td>
                    <td className="p-2">{change.state.replaceAll("_", " ")}</td>
                    <td className="p-2">
                      <time dateTime={change.updatedAt}>
                        {new Date(change.updatedAt).toLocaleString()}
                      </time>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton
                          disabled={busy}
                          label="View diff"
                          onClick={() => void viewChangeDetail(change.id)}
                        />
                        {change.state === "DRAFT" && capabilities.has("changes.submit") ? (
                          <ActionButton
                            disabled={busy}
                            label="Submit"
                            onClick={() =>
                              mutate(`/api/admin/control-plane/changes/${change.id}/submit`, {
                                expectedVersion: change.version,
                              })
                            }
                          />
                        ) : null}
                        {change.state === "PENDING_REVIEW" &&
                        change.requestedByUserId !== props.currentUserId &&
                        capabilities.has("changes.approve") ? (
                          <>
                            <ActionButton
                              disabled={busy}
                              label="Approve"
                              onClick={() =>
                                mutate(`/api/admin/control-plane/changes/${change.id}/approve`, {
                                  expectedVersion: change.version,
                                })
                              }
                            />
                            <ActionButton
                              disabled={busy}
                              label="Reject"
                              onClick={() =>
                                mutate(`/api/admin/control-plane/changes/${change.id}/reject`, {
                                  expectedVersion: change.version,
                                })
                              }
                            />
                          </>
                        ) : null}
                        {change.state === "APPROVED" && capabilities.has("changes.activate") ? (
                          <>
                            <input
                              aria-label={`Schedule activation for ${change.id.slice(0, 12)}`}
                              className={`${inputClass} max-w-56`}
                              type="datetime-local"
                              value={scheduleFor[change.id] ?? ""}
                              onChange={(event) =>
                                setScheduleFor((current) => ({
                                  ...current,
                                  [change.id]: event.target.value,
                                }))
                              }
                            />
                            <ActionButton
                              disabled={busy || !scheduleFor[change.id]}
                              label="Schedule"
                              onClick={() => {
                                const value = scheduleFor[change.id];
                                if (!value) return;
                                return mutate(
                                  `/api/admin/control-plane/changes/${change.id}/schedule`,
                                  {
                                    expectedVersion: change.version,
                                    scheduledFor: new Date(value).toISOString(),
                                  }
                                );
                              }}
                            />
                            <ActionButton
                              disabled={busy}
                              label="Activate now"
                              onClick={() =>
                                mutate(`/api/admin/control-plane/changes/${change.id}/activate`, {
                                  expectedVersion: change.version,
                                  expectedResourceVersion: resource?.version ?? 1,
                                })
                              }
                            />
                          </>
                        ) : null}
                        {change.state === "ACTIVE" && capabilities.has("changes.rollback") ? (
                          <>
                            <select
                              aria-label={`Rollback version for ${change.id.slice(0, 12)}`}
                              className={inputClass}
                              value={rollbackVersion[change.id] ?? ""}
                              onChange={(event) =>
                                setRollbackVersion((current) => ({
                                  ...current,
                                  [change.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select version</option>
                              {(resource?.versions ?? []).map((version) => (
                                <option key={version.id} value={version.id}>
                                  v{version.versionNumber}
                                </option>
                              ))}
                            </select>
                            <ActionButton
                              disabled={busy || !rollbackVersion[change.id]}
                              label="Rollback"
                              onClick={() =>
                                mutate(`/api/admin/control-plane/changes/${change.id}/rollback`, {
                                  expectedVersion: change.version,
                                  expectedResourceVersion: resource?.version ?? 1,
                                  rollbackConfigVersionId: rollbackVersion[change.id] ?? "",
                                })
                              }
                            />
                          </>
                        ) : null}
                        {!["DRAFT", "PENDING_REVIEW", "APPROVED", "ACTIVE"].includes(
                          change.state
                        ) ? (
                          <span>No action available</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className={`${panelClass} border-l-2 border-l-[var(--atlas-amber)]`}
        aria-labelledby="credentials-heading"
      >
        <p className="atlas-micro-label text-[var(--atlas-amber)]">Vault</p>
        <h2 id="credentials-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
          API credentials
        </h2>
        <p className="mt-2 text-sm text-[var(--atlas-text-secondary)]">
          Secret values and key hashes are never shown after initial creation or rotation.
        </p>
        {capabilities.has("credentials.manage") ? (
          <form action={createCredential} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Credential name
              <input className={inputClass} name="name" required maxLength={100} />
            </label>
            <label className="grid gap-1 text-sm">
              Environment
              <select className={inputClass} name="environment" defaultValue="development">
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </label>
            <button className={buttonClass} disabled={busy} type="submit">
              Create credential
            </button>
          </form>
        ) : null}
        <div className="sf-table-wrap mt-4 overflow-x-auto rounded-[var(--radius-sm)]">
        <table className="w-full text-left text-sm text-[var(--atlas-text)]">
          <caption className="sr-only">Organization API credential metadata</caption>
          <thead>
            <tr>
              <th scope="col" className="p-2">Name</th>
              <th scope="col" className="p-2">Environment</th>
              <th scope="col" className="p-2">Ending</th>
              <th scope="col" className="p-2">Status</th>
              <th scope="col" className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.credentials.map((credential) => (
              <tr key={credential.id} className="border-t border-[var(--atlas-line)]">
                <td className="p-2">{credential.name}</td>
                <td className="p-2 capitalize">{credential.environment}</td>
                <td className="p-2 font-mono">••••{credential.last4}</td>
                <td className="p-2 capitalize">{credential.status}</td>
                <td className="p-2">
                  {capabilities.has("credentials.manage") &&
                  credential.status === "active" ? (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        disabled={busy}
                        label="Rotate"
                        onClick={() =>
                          mutate(
                            `/api/admin/control-plane/credentials/${credential.id}/rotate`,
                            { expectedVersion: credential.version }
                          )
                        }
                      />
                      <ActionButton
                        disabled={busy}
                        label="Revoke"
                        onClick={() =>
                          mutate(
                            `/api/admin/control-plane/credentials/${credential.id}/revoke`,
                            { expectedVersion: credential.version }
                          )
                        }
                      />
                    </div>
                  ) : (
                    <span>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section
        className={`${panelClass} border-l-2 border-l-[var(--atlas-amber)]`}
        aria-labelledby="audit-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="atlas-micro-label text-[var(--atlas-amber)]">Forensic stream</p>
            <h2 id="audit-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
              Sanitized audit activity
            </h2>
          </div>
          <div className="flex gap-2">
            <a className={buttonSecondaryClass} href="/api/admin/control-plane/export?kind=configuration">
              Export configuration
            </a>
            <a className={buttonClass} href="/api/admin/control-plane/export?kind=audit">
              Export audit
            </a>
          </div>
        </div>
        <ol className="mt-4 max-h-80 space-y-0 overflow-y-auto border-l border-[var(--atlas-line)] pl-3">
          {props.audit.map((event) => (
            <li key={event.id} className="relative py-2.5 pl-1 text-sm">
              <span
                className="absolute -left-[0.97rem] top-3.5 h-1.5 w-1.5 rounded-full bg-[var(--atlas-amber)]"
                aria-hidden="true"
              />
              <span className="font-medium text-[var(--atlas-text)]">{event.action}</span>{" "}
              <span>— {event.outcome}</span>
              <time
                className="ml-2 font-mono text-[10px] text-[var(--atlas-text-muted)]"
                dateTime={event.createdAt}
              >
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      </section>

      {oneTimeSecret ? (
        <OneTimeSecretModal
          title="API credential created"
          secret={oneTimeSecret}
          description="Store this API key in your secret manager. It cannot be retrieved again from this dashboard."
          onClose={() => setOneTimeSecret(null)}
        />
      ) : null}

      {changeDetail ? (
        <div
          ref={changeDetailRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--atlas-void)_72%,transparent)] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-detail-title"
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--atlas-elevated)] p-6 shadow-[var(--shadow-floating)]">
            <p className="atlas-micro-label text-[var(--atlas-violet)]">Lineage diff</p>
            <h2 id="change-detail-title" className="mt-1 text-lg font-semibold text-[var(--atlas-text)]">
              Change detail — {changeDetail.resource.name}
            </h2>
            <p className="mt-1 font-mono text-[10px] text-[var(--atlas-text-muted)]">
              Status: {changeDetail.change.state.replaceAll("_", " ")} · Target v
              {changeDetail.targetConfig.versionNumber}
            </p>
            <h3 className="mt-4 text-sm font-medium text-[var(--atlas-text)]">
              Sanitized diff vs active configuration
            </h3>
            <pre className="mt-2 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs text-[var(--atlas-text-secondary)]">
              {JSON.stringify(changeDetail.diffVsActive, null, 2)}
            </pre>
            <h3 className="mt-4 text-sm font-medium text-[var(--atlas-text)]">
              Target version diff (sanitized)
            </h3>
            <pre className="mt-2 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs text-[var(--atlas-text-secondary)]">
              {JSON.stringify(changeDetail.targetConfig.sanitizedDiff, null, 2)}
            </pre>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className={buttonClass}
                onClick={() => setChangeDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
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
      className={buttonSecondaryClass}
      disabled={disabled}
      onClick={() => void onClick()}
    >
      {label}
    </button>
  );
}
