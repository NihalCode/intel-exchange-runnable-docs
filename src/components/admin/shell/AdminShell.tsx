"use client";

import { AdminHeader } from "@/components/admin/shell/AdminHeader";
import { AdminSidebar } from "@/components/admin/shell/AdminSidebar";
import { ProductionBanner } from "@/components/admin/shell/ProductionBanner";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      <ProductionBanner />
      <div className="flex flex-1">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminHeader />
          <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
