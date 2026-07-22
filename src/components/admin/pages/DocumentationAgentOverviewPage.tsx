"use client";

import Link from "next/link";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { MetricCard } from "@/components/admin/ui/MetricCard";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { cardClass, linkClass } from "@/components/admin/ui/tokens";

export function DocumentationAgentOverviewPage() {
  const { organization, hasPermission } = useAdmin();

  const allLinks = [
    { href: "/admin/documentation-agent/apis", label: "APIs", permission: "resources.read" as const },
    { href: "/admin/documentation-agent/sync-jobs", label: "Sync Jobs", permission: "jobs.read" as const },
    { href: "/admin/documentation-agent/keys", label: "API Keys", permission: "credentials.read_metadata" as const },
  ];
  const links = allLinks.filter((l) => hasPermission(l.permission));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow={organization.name}
        title="Documentation Agent"
        description="Manage API resources, configuration changes, credentials, and sync jobs for the Documentation Agent."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Resources" value="—" change="View APIs" trend="flat" />
        <MetricCard label="Pending changes" value="—" change="View changes" trend="flat" />
        <MetricCard label="Active credentials" value="—" change="View keys" trend="flat" />
      </div>

      <section className={cardClass}>
        <h2 className="font-semibold">Quick links</h2>
        <ul className="mt-3 flex flex-wrap gap-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={linkClass}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
