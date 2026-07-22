"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminAppExitNav } from "@/components/admin/layout/AdminAppExitNav";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { EnvironmentSelector } from "@/components/admin/layout/ProductionBanner";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  breadcrumbsForPath,
  pageTitleForPath,
} from "@/lib/admin/navigation";

export function AdminHeader({ titleSlot }: { titleSlot?: React.ReactNode }) {
  const pathname = usePathname();
  const { organization, user } = useAdmin();
  const crumbs = breadcrumbsForPath(pathname);
  const title = pageTitleForPath(pathname);

  return (
    <header
      className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--surface-header)] backdrop-blur"
      data-layout="cx-admin-header"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="text-xs text-[var(--text-muted)]">
            <ol className="flex flex-wrap items-center gap-1">
              {crumbs.map((crumb, i) => (
                <li key={crumb.label} className="flex items-center gap-1">
                  {i > 0 ? <span aria-hidden="true">/</span> : null}
                  {crumb.href && i < crumbs.length - 1 ? (
                    <Link
                      href={crumb.href}
                      className="hover:text-[var(--text-link)]"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-[var(--text-secondary)]">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-[var(--text-heading)]">
              {titleSlot ?? title}
            </h1>
            <span className="rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              {user.role}
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">{organization.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-layout="cx-admin-toolbar">
          <AdminAppExitNav variant="header" />
          <EnvironmentSelector />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
