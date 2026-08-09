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
      className="atlas-admin-header sticky top-0 z-20 border-b border-[var(--atlas-line)] bg-[var(--atlas-surface)] backdrop-blur-md"
      data-layout="cx-admin-header"
    >
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="atlas-breadcrumb text-[10px]">
            <ol className="flex flex-wrap items-center gap-1">
              {crumbs.map((crumb, i) => (
                <li key={crumb.label} className="atlas-breadcrumb__item flex items-center gap-1">
                  {i > 0 ? (
                    <span className="atlas-breadcrumb__sep" aria-hidden="true" />
                  ) : null}
                  {crumb.href && i < crumbs.length - 1 ? (
                    <Link
                      href={crumb.href}
                      className="text-[var(--atlas-text-muted)] hover:text-[var(--atlas-signal)]"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-[var(--atlas-text-secondary)]">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold tracking-[-0.02em] text-[var(--atlas-text)] sm:text-lg">
              {titleSlot ?? title}
            </h1>
            <span className="atlas-threat-badge atlas-threat-badge--muted font-mono text-[10px] uppercase tracking-[0.1em]">
              {user.role}
            </span>
          </div>
          <p className="atlas-micro-label mt-0.5 !inline">{organization.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-layout="cx-admin-toolbar">
          <AdminAppExitNav variant="header" />
          <EnvironmentSelector />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
