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

  function renderNav(tone: "default" | "inverse") {
    return (
      <nav aria-label="Administration" className="flex flex-col gap-1 p-3" data-nav-tone={tone}>
        {groups.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            pathname={pathname}
            collapsed={!!collapsed[group.id]}
            tone={tone}
            onToggle={() => toggleGroup(group.id)}
            onNavigate={() => setMobileOpen(false)}
          />
        ))}
      </nav>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-primary)] text-white shadow-lg lg:hidden"
        aria-label="Open admin navigation"
        aria-expanded={mobileOpen}
        aria-controls="admin-navigation-drawer"
        onClick={() => setMobileOpen(true)}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>

      <aside
        className="hidden w-[16.5rem] shrink-0 border-r border-white/10 lg:block"
        data-layout="cx-admin-nav-rail"
        data-tone="inverse"
      >
        <div className="sticky top-0 flex h-screen flex-col bg-[var(--brand-navy-deep)] text-white">
          <div className="border-b border-white/10 px-4 py-4">
            <Link href="/admin" className="flex items-center gap-2" data-testid="admin-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cyware_logo.png" alt="" width={24} height={24} className="h-6 w-6 object-contain brightness-0 invert" />
              <span>
                <span className="block text-sm font-semibold text-white">
                  CYWARE | Admin
                </span>
                <span className="block text-[10px] text-white/70">Control plane</span>
              </span>
            </Link>
          </div>
          <AdminAppExitNav variant="sidebar" tone="inverse" />
          <div className="flex-1 overflow-y-auto scroll-thin">{renderNav("inverse")}</div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--surface-overlay)]"
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
            className="absolute left-0 top-0 h-full w-72 border-r border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[var(--shadow-drawer)]"
          >
            <div className="border-b border-[var(--border-subtle)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--text-heading)]">Enterprise Admin</p>
            </div>
            <AdminAppExitNav variant="sidebar" tone="default" />
            <div className="overflow-y-auto scroll-thin">{renderNav("default")}</div>
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
  tone,
  onToggle,
  onNavigate,
}: {
  group: AdminNavGroup;
  pathname: string;
  collapsed: boolean;
  tone: "default" | "inverse";
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const hasActive = group.items.some((item) => isNavItemActive(pathname, item));
  const inverse = tone === "inverse";

  return (
    <div className="mb-2">
      <button
        type="button"
        className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide ${
          inverse
            ? "text-white/65 hover:bg-white/10 hover:text-white"
            : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
        }`}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <ChevronIcon open={!collapsed} />
        {group.label}
        {hasActive && collapsed ? (
          <span
            className={`ml-auto h-1.5 w-1.5 rounded-full ${inverse ? "bg-white" : "bg-[var(--accent-primary)]"}`}
            aria-hidden="true"
          />
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
                  className={`block rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                    inverse
                      ? active
                        ? "bg-white/15 text-white"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                      : active
                        ? "bg-[var(--surface-muted)] text-[var(--text-link)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
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
