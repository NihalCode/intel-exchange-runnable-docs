"use client";

import { AdminHeader } from "@/components/admin/layout/AdminHeader";
import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { ProductionBanner } from "@/components/admin/layout/ProductionBanner";

export function AdminFrame({ children }: { children: React.ReactNode }) {
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
