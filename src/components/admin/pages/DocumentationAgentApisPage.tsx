"use client";

import { useMemo, useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { useControlPlaneMutation } from "@/components/admin/hooks/useControlPlaneMutation";
import { PageHeader, StatusMessage } from "@/components/admin/ui/PageHeader";
import { PermissionGate } from "@/components/admin/ui/PermissionGate";
import { SecretCreatedDialog } from "@/components/admin/ui/SecretCreatedDialog";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { ConfigurationDiff, DetailsDrawer } from "@/components/admin/ui/PermissionGate";
import { DataTable } from "@/components/admin/ui/DataTable";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
} from "@/components/admin/ui/tokens";

const panelClass =
  "rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4";
import type { EnterpriseAuditEvent } from "@/lib/enterprise/audit";
import type { ChangeRequestRecord, EnterprisePermission } from "@/lib/enterprise/types";
import type {
  ConfigVersionRecord,
  ControlPlaneResourceRecord,
} from "@/lib/enterprise/repository";
import type { ApiCredentialMetadata } from "@/lib/enterprise/api-keys";

type SafeCredential = Omit<ApiCredentialMetadata, "keyHash" | "vaultRef">;
type Resource = ControlPlaneResourceRecord & { versions: ConfigVersionRecord[] };

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

interface Props {
  currentUserId: string;
  capabilities: EnterprisePermission[];
  resources: Resource[];
  changes: ChangeRequestRecord[];
  credentials: SafeCredential[];
  audit: EnterpriseAuditEvent[];
}

export function DocumentationAgentApisPage(props: Props) {
  const { organization, selectedEnvironment, hasPermission } = useAdmin();
  const { mutate, busy, status } = useControlPlaneMutation();
  const capabilities = new Set(props.capabilities);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [changeDetail, setChangeDetail] = useState<ChangeDetail | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Record<string, string>>({});
  const [rollbackVersion, setRollbackVersion] = useState<Record<string, string>>({});

  const envResources = useMemo(
    () => props.resources.filter((r) => r.environment === selectedEnvironment),
    [props.resources, selectedEnvironment]
  );

  const envChanges = useMemo(
    () =>
      props.changes.filter((change) => {
        const resource = props.resources.find((r) => r.id === change.resourceId);
        return resource?.environment === selectedEnvironment;
      }),
    [props.changes, props.resources, selectedEnvironment]
  );

  const envCredentials = useMemo(
    () => props.credentials.filter((c) => c.environment === selectedEnvironment),
    [props.credentials, selectedEnvironment]
  );

  async function createResource(formData: FormData) {
    const result = await mutate("/api/admin/control-plane/resources", {
      name: String(formData.get("name") ?? ""),
      environment: selectedEnvironment,
      resourceType: "docs-agent",
    });
    void result;
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
        { idempotencyKey: crypto.randomUUID() }
      );
    } catch {
      /* status set by hook */
    }
  }

  async function createCredential(formData: FormData) {
    const result = await mutate("/api/admin/control-plane/credentials", {
      name: String(formData.get("name") ?? ""),
      environment: selectedEnvironment,
      expiresAt: null,
    });
    if (result.oneTime && result.plaintext) setOneTimeSecret(result.plaintext);
  }

  async function viewChangeDetail(changeId: string) {
    const response = await fetch(`/api/admin/control-plane/changes/${changeId}`, {
      cache: "no-store",
    });
    const result = (await response.json()) as ChangeDetail & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Failed to load change detail");
    setChangeDetail(result);
  }

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-apis-control-plane"
    >
      <PageHeader
        eyebrow={organization.name}
        title="APIs"
        description="Manage Documentation Agent resources, controlled configuration changes, and credentials."
        actions={<LiveStatus label={selectedEnvironment} tone="signal" />}
      />
      <StatusMessage message={status} />

      <PermissionGate permission="resources.write" hasPermission={hasPermission}>
        {capabilities.has("resources.write") ? (
          <section className={`${panelClass} border-l-2 border-l-[var(--atlas-signal)]`} aria-labelledby="create-resource-heading">
            <p className="atlas-micro-label text-[var(--atlas-signal)]">Provision</p>
            <h2 id="create-resource-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
              Create API resource
            </h2>
            <form action={createResource} className="mt-4 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm">
                <span className="atlas-micro-label">Resource name</span>
                <input className={inputClass} name="name" required maxLength={100} />
              </label>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--atlas-text-muted)]">
                Environment: {selectedEnvironment}
              </span>
              <button className={buttonPrimaryClass} disabled={busy} type="submit">
                Create resource
              </button>
            </form>
          </section>
        ) : null}
      </PermissionGate>

      <section className={panelClass} aria-labelledby="resources-heading">
        <p className="atlas-micro-label text-[var(--atlas-signal)]">Resource lattice</p>
        <h2 id="resources-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
          Resources — {selectedEnvironment}
        </h2>
        {envResources.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {envResources.map((resource) => (
              <div
                key={resource.id}
                className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-operational)] p-3"
              >
                <h3 className="font-medium text-[var(--atlas-text)]">{resource.name}</h3>
                <p className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
                  Active version: {resource.activeConfigVersion ?? "None"}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-[var(--atlas-text-secondary)]">
                  {resource.versions.map((version) => (
                    <li key={version.id} className="font-mono text-xs">
                      v{version.versionNumber} —{" "}
                      <time dateTime={version.createdAt}>
                        {new Date(version.createdAt).toLocaleDateString()}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--atlas-text-muted)]">No resources in this environment.</p>
        )}
      </section>

      {capabilities.has("changes.create") && envResources.length ? (
        <section className={panelClass} aria-labelledby="create-change-heading">
          <p className="atlas-micro-label text-[var(--atlas-violet)]">Draft change</p>
          <h2 id="create-change-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
            Draft configuration change
          </h2>
          <form action={createChange} className="mt-4 grid max-w-2xl gap-3">
            <label className="grid gap-1 text-sm">
              Resource
              <select className={inputClass} name="resourceId">
                {envResources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
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
            <button className={`${buttonPrimaryClass} justify-self-start`} disabled={busy} type="submit">
              Create draft
            </button>
          </form>
        </section>
      ) : null}

      <section className={panelClass} aria-labelledby="changes-heading">
        <p className="atlas-micro-label text-[var(--atlas-violet)]">Change pipeline</p>
        <h2 id="changes-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
          Change requests
        </h2>
        <DataTable
          caption="Documentation Agent change requests"
          data={envChanges}
          rowKey={(c) => c.id}
          columns={[
            {
              key: "id",
              header: "Request",
              render: (c) => (
                <span className="font-mono text-xs">{c.id.slice(0, 12)}</span>
              ),
            },
            {
              key: "state",
              header: "Status",
              sortable: true,
              sortValue: (c) => c.state,
              render: (c) => <StatusBadge status={c.state} />,
            },
            {
              key: "updated",
              header: "Updated",
              sortable: true,
              sortValue: (c) => c.updatedAt,
              render: (c) => (
                <time dateTime={c.updatedAt}>
                  {new Date(c.updatedAt).toLocaleString()}
                </time>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              render: (change) => {
                const resource = props.resources.find((r) => r.id === change.resourceId);
                return (
                  <div className="flex flex-wrap gap-2">
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
                          onChange={(e) =>
                            setScheduleFor((cur) => ({
                              ...cur,
                              [change.id]: e.target.value,
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
                          label="Activate"
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
                          onChange={(e) =>
                            setRollbackVersion((cur) => ({
                              ...cur,
                              [change.id]: e.target.value,
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
                  </div>
                );
              },
            },
          ]}
          emptyTitle="No change requests"
          emptyDescription="Create a draft change to begin the approval workflow."
        />
      </section>

      <section className={`${panelClass} border-l-2 border-l-[var(--atlas-amber)]`} aria-labelledby="credentials-heading">
        <p className="atlas-micro-label text-[var(--atlas-amber)]">Vault slice</p>
        <h2 id="credentials-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
          API credentials
        </h2>
        <p className="mt-1 text-sm text-[var(--atlas-text-secondary)]">
          Secret values are shown once on create or rotate only.
        </p>
        {capabilities.has("credentials.manage") ? (
          <form action={createCredential} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Credential name
              <input className={inputClass} name="name" required maxLength={100} />
            </label>
            <button className={buttonPrimaryClass} disabled={busy} type="submit">
              Create credential
            </button>
          </form>
        ) : null}
        <div className="mt-4">
          <DataTable
            caption="API credentials"
            data={envCredentials}
            rowKey={(c) => c.id}
            columns={[
              { key: "name", header: "Name", sortable: true, sortValue: (c) => c.name, render: (c) => c.name },
              {
                key: "last4",
                header: "Ending",
                render: (c) => <span className="font-mono">••••{c.last4}</span>,
              },
              {
                key: "status",
                header: "Status",
                render: (c) => <StatusBadge status={c.status} />,
              },
              {
                key: "actions",
                header: "Actions",
                render: (credential) =>
                  capabilities.has("credentials.manage") &&
                  credential.status === "active" ? (
                    <div className="flex gap-2">
                      <ActionButton
                        disabled={busy}
                        label="Rotate"
                        onClick={async () => {
                          const result = await mutate(
                            `/api/admin/control-plane/credentials/${credential.id}/rotate`,
                            { expectedVersion: credential.version }
                          );
                          if (result.oneTime && result.plaintext) {
                            setOneTimeSecret(result.plaintext);
                          }
                        }}
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
                    "—"
                  ),
              },
            ]}
            emptyTitle="No credentials"
          />
        </div>
      </section>

      <section className={`${panelClass} border-l-2 border-l-[var(--atlas-amber)]`} aria-labelledby="audit-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="atlas-micro-label text-[var(--atlas-amber)]">Forensic stream</p>
            <h2 id="audit-heading" className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
              Recent audit activity
            </h2>
          </div>
          <div className="flex gap-2">
            <a className={buttonSecondaryClass} href="/api/admin/control-plane/export?kind=configuration">
              Export configuration
            </a>
            <a className={buttonPrimaryClass} href="/api/admin/control-plane/export?kind=audit">
              Export audit
            </a>
          </div>
        </div>
        <ol className="mt-4 max-h-80 space-y-0 overflow-y-auto border-l border-[var(--atlas-line)] pl-3">
          {props.audit.slice(0, 20).map((event) => (
            <li
              key={event.id}
              className="relative py-2.5 pl-1 text-sm"
            >
              <span
                className="absolute -left-[0.97rem] top-3.5 h-1.5 w-1.5 rounded-full bg-[var(--atlas-amber)]"
                aria-hidden="true"
              />
              <span className="font-medium text-[var(--atlas-text)]">{event.action}</span> —{" "}
              {event.outcome}
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

      <SecretCreatedDialog secret={oneTimeSecret} onClose={() => setOneTimeSecret(null)} />

      <DetailsDrawer
        open={!!changeDetail}
        title={changeDetail ? `Change — ${changeDetail.resource.name}` : "Change detail"}
        onClose={() => setChangeDetail(null)}
      >
        {changeDetail ? (
          <div className="space-y-4">
            <p className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
              Status: {changeDetail.change.state.replaceAll("_", " ")} · Target v
              {changeDetail.targetConfig.versionNumber}
            </p>
            <ConfigurationDiff
              before={changeDetail.diffVsActive}
              after={changeDetail.targetConfig.sanitizedDiff}
            />
          </div>
        ) : null}
      </DetailsDrawer>
    </div>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => unknown;
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
