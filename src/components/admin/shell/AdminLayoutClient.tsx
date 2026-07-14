"use client";

import { Suspense } from "react";

import { AdminProvider } from "@/components/admin/context/AdminContext";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import { LoadingSkeleton } from "@/components/admin/ui/EmptyState";
import type { EnterprisePermission } from "@/lib/enterprise/types";

export function AdminLayoutClient({
  organization,
  user,
  capabilities,
  enabledFeatures,
  children,
}: {
  organization: { id: string; name: string; slug: string };
  user: { id: string; email: string; role: string };
  capabilities: EnterprisePermission[];
  enabledFeatures: string[];
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<LoadingSkeleton rows={8} />}>
      <AdminProvider
        organization={organization}
        user={user}
        capabilities={capabilities}
        enabledFeatures={enabledFeatures}
      >
        <AdminShell>{children}</AdminShell>
      </AdminProvider>
    </Suspense>
  );
}
