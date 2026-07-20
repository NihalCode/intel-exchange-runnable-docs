"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminAppExitNav } from "@/components/admin/layout/AdminAppExitNav";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { useFocusTrap } from "@/components/useFocusTrap";
import {
  filterNavByCapabilities,
  isNavItemActive,
  type AdminNavGroup,
} from "@/lib/admin/navigation";

const STORAGE_KEY = "admin-nav-collapsed";

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { capabilities, enabledFeatures } = useAdmin();
  const groups = filterNavByCapabilities(capabilities, enabledFeatures);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDrawerRef = useFocusTrap(mobileOpen, () => setMobileOpen(false));

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setCollapsed(loadCollapsed());
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const navContent = (
    <nav aria-label="Administration" className="flex flex-col gap-1 p-3">
      {groups.map((group) => (
        <NavGroup
          key={group.id}
          group={group}
          pathname={pathname}
          collapsed={!!collapsed[group.id]}
          onToggle={() => toggleGroup(group.id)}
          onNavigate={() => setMobileOpen(false)}
        />
      ))}
    </nav>
  );

  return (
    <>
      <button
        type="button"
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-sky-700 text-white shadow-lg lg:hidden"
        aria-label="Open admin navigation"
        aria-expanded={mobileOpen}
        aria-controls="admin-navigation-drawer"
        onClick={() => setMobileOpen(true)}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>

      <aside className="hidden w-72 shrink-0 border-r border-zinc-200 lg:block dark:border-zinc-800">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
            <Link href="/admin" className="text-sm font-semibold">
              Enterprise Admin
            </Link>
            <p className="mt-0.5 text-xs text-zinc-500">Control plane</p>
          </div>
          <AdminAppExitNav variant="sidebar" />
          <div className="flex-1 overflow-y-auto">{navContent}</div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            ref={mobileDrawerRef}
            id="admin-navigation-drawer"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Administration navigation"
            className="absolute left-0 top-0 h-full w-72 border-r border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
              <p className="text-sm font-semibold">Enterprise Admin</p>
            </div>
            <AdminAppExitNav variant="sidebar" />
            <div className="overflow-y-auto">{navContent}</div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function NavGroup({
  group,
  pathname,
  collapsed,
  onToggle,
  onNavigate,
}: {
  group: AdminNavGroup;
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const hasActive = group.items.some((item) => isNavItemActive(pathname, item));

  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <ChevronIcon open={!collapsed} />
        {group.label}
        {hasActive && collapsed ? (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sky-600" aria-hidden="true" />
        ) : null}
      </button>
      {!collapsed ? (
        <ul className="mt-1 space-y-0.5 pl-2">
          {group.items.map((item) => {
            const active = isNavItemActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`block rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                    active
                      ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
