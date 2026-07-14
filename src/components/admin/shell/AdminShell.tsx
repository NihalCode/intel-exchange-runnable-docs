"use client";

import { AdminHeader } from "@/components/admin/shell/AdminHeader";
import { AdminSidebar } from "@/components/admin/shell/AdminSidebar";
import { ProductionBanner } from "@/components/admin/shell/ProductionBanner";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      <ProductionBanner />
      <a href="#admin-main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex flex-1">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminHeader />
          <main id="admin-main-content" tabIndex={-1} className="flex-1 px-4 py-6 sm:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
