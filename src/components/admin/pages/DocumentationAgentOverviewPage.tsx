"use client";

import Link from "next/link";

import { LiveStatus, TelemetryValue } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { linkClass } from "@/components/admin/ui/tokens";

export function DocumentationAgentOverviewPage() {
  const { organization, hasPermission, selectedEnvironment } = useAdmin();

  const allLinks = [
    { href: "/admin/documentation-agent/apis", label: "APIs", permission: "resources.read" as const },
    { href: "/admin/documentation-agent/sync-jobs", label: "Sync Jobs", permission: "jobs.read" as const },
    { href: "/admin/documentation-agent/keys", label: "API Keys", permission: "credentials.read_metadata" as const },
  ];
  const links = allLinks.filter((l) => hasPermission(l.permission));

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-docs-agent-overview"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Documentation Agent"
        description="Control-plane signal surface for resources, credentials, and sync jobs."
        actions={<LiveStatus label={selectedEnvironment} tone="signal" />}
      />

      <section
        className="grid gap-2 sm:grid-cols-3"
        aria-label="Overview telemetry placeholders"
      >
        <div className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] px-3 py-2.5">
          <TelemetryValue label="Resources" value="—" />
          <p className="mt-1 font-mono text-[10px] text-[var(--atlas-text-muted)]">View APIs</p>
        </div>
        <div className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-operational)] px-3 py-2.5">
          <TelemetryValue label="Pending changes" value="—" />
          <p className="mt-1 font-mono text-[10px] text-[var(--atlas-text-muted)]">View changes</p>
        </div>
        <div className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-operational)] px-3 py-2.5">
          <TelemetryValue label="Active credentials" value="—" />
          <p className="mt-1 font-mono text-[10px] text-[var(--atlas-text-muted)]">View keys</p>
        </div>
      </section>

      <section
        className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-signal)] bg-[color-mix(in_srgb,var(--atlas-elevated)_88%,transparent)] p-4"
        aria-labelledby="docs-agent-links"
      >
        <p id="docs-agent-links" className="atlas-micro-label text-[var(--atlas-signal)]">
          Quick lattice
        </p>
        {links.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--atlas-text-muted)]">No permitted destinations.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`${linkClass} inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-operational)] px-2.5 py-1.5 text-xs no-underline hover:border-[var(--atlas-line-strong)]`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
