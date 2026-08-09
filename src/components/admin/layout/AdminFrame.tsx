"use client";

import { AdminHeader } from "@/components/admin/layout/AdminHeader";
import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { ProductionBanner } from "@/components/admin/layout/ProductionBanner";

export function AdminFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="cx-admin-shell atlas-admin-shell flex min-h-screen flex-col bg-[var(--atlas-void)]"
      data-testid="admin-frame"
      data-layout="cx-admin-shell"
    >
      <ProductionBanner />
      <a href="#admin-main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex flex-1" data-layout="cx-admin-body">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col" data-layout="cx-admin-work-area">
          <AdminHeader />
          <main
            id="admin-main-content"
            tabIndex={-1}
            className="atlas-admin-main flex-1 px-3 py-4 sm:px-5"
            data-layout="cx-admin-main"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
