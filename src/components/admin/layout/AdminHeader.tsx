"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AdminAppExitNav } from "@/components/admin/layout/AdminAppExitNav";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { EnvironmentSelector } from "@/components/admin/layout/ProductionBanner";
import {
  breadcrumbsForPath,
  pageTitleForPath,
} from "@/lib/admin/navigation";

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  if (typeof window !== "undefined") {
    const isDark = document.documentElement.classList.contains("dark");
    if (isDark !== dark) setDark(isDark);
  }
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {dark ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 14a5 5 0 100-10 5 5 0 000 10zm9-5a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5 12a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zm12.95 6.95a1 1 0 01-1.41 0l-.71-.71a1 1 0 111.41-1.41l.71.71a1 1 0 010 1.41zM7.76 7.76a1 1 0 01-1.41 0l-.71-.71A1 1 0 117.05 5.64l.71.71a1 1 0 010 1.41zm0 8.48a1 1 0 010 1.41l-.71.71a1 1 0 01-1.41-1.41l.71-.71a1 1 0 011.41 0zm9.19-9.19a1 1 0 010-1.41l.71-.71a1 1 0 111.41 1.41l-.71.71a1 1 0 01-1.41 0zM12 19a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}

export function AdminHeader({ titleSlot }: { titleSlot?: React.ReactNode }) {
  const pathname = usePathname();
  const { organization, user } = useAdmin();
  const crumbs = breadcrumbsForPath(pathname);
  const title = pageTitleForPath(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <ol className="flex flex-wrap items-center gap-1">
              {crumbs.map((crumb, i) => (
                <li key={crumb.label} className="flex items-center gap-1">
                  {i > 0 ? <span aria-hidden="true">/</span> : null}
                  {crumb.href && i < crumbs.length - 1 ? (
                    <Link href={crumb.href} className="hover:text-sky-700 dark:hover:text-sky-300">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-zinc-700 dark:text-zinc-300">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-lg font-semibold">{titleSlot ?? title}</h1>
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {user.role}
            </span>
          </div>
          <p className="text-xs text-zinc-500">{organization.name}</p>
        </div>
        <AdminAppExitNav variant="header" />
        <EnvironmentSelector />
        <ThemeToggle />
      </div>
    </header>
  );
}
