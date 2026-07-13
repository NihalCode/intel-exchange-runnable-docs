"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PLACEHOLDER_NOTICE } from "@/lib/admin/mock-data";

export function DocumentationAgentDomainsPage() {
  const { organization, selectedEnvironment } = useAdmin();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Domains"
        description="Custom domains for Documentation Agent endpoints."
      />
      <p className="text-xs text-amber-700 dark:text-amber-300">{PLACEHOLDER_NOTICE}</p>
      <EmptyState
        title="No custom domains"
        description={`Domain management for ${selectedEnvironment} will appear here when the control-plane API is available.`}
      />
    </div>
  );
}
