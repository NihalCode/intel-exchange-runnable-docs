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
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
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
  const { capabilities, enabledFeatures, user } = useAdmin();
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
      <nav aria-label="Administration" className="flex flex-col gap-0.5 p-2" data-nav-tone={tone}>
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
        className="fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--atlas-line-strong)] bg-[var(--atlas-signal)] text-[#04110e] shadow-[var(--shadow-resting)] lg:hidden"
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
        className="atlas-admin-rail hidden w-[15.5rem] shrink-0 border-r border-[var(--atlas-line)] lg:block"
        data-layout="cx-admin-nav-rail"
        data-tone="inverse"
      >
        <div className="sticky top-0 flex h-screen flex-col bg-[color-mix(in_srgb,var(--atlas-elevated)_94%,transparent)] text-[var(--atlas-text)] backdrop-blur-md">
          <div className="border-b border-[var(--atlas-line)] px-3 py-3">
            <Link href="/admin" className="flex items-center gap-2.5" data-testid="admin-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cyware_logo.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
              <span>
                <span className="block text-sm font-semibold text-white">
                  CYWARE | Admin
                </span>
                <span className="atlas-micro-label mt-0.5 !inline text-white/70">Control plane</span>
              </span>
            </Link>
          </div>
          <AdminAppExitNav variant="sidebar" tone="inverse" />
          <div className="flex-1 overflow-y-auto scroll-thin">{renderNav("inverse")}</div>
          <div className="border-t border-[var(--atlas-line)] px-3 py-2.5">
            <p className="atlas-micro-label text-white/65">Clearance</p>
            <p className="truncate font-mono text-[11px] text-white/85">{user.role}</p>
          </div>
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
            className="absolute left-0 top-0 h-full w-72 border-r border-[var(--atlas-line)] bg-[var(--atlas-elevated)] shadow-[var(--shadow-drawer)]"
          >
            <div className="border-b border-[var(--atlas-line)] px-3 py-2.5">
              <p className="atlas-micro-label">Admin</p>
              <p className="text-sm font-semibold text-[var(--atlas-text)]">Enterprise Admin</p>
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
    <div className="mb-1.5">
      <button
        type="button"
        className={`atlas-micro-label flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left !normal-case tracking-[0.1em] ${
          inverse
            ? "text-white/65 hover:bg-white/10 hover:text-white"
            : "text-[var(--atlas-text-muted)] hover:bg-[var(--surface-muted)]"
        }`}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <ChevronIcon open={!collapsed} />
        {group.label}
        {hasActive && collapsed ? (
          <span
            className={`ml-auto h-1.5 w-1.5 rounded-full ${inverse ? "bg-white" : "bg-[var(--atlas-signal)]"}`}
            aria-hidden="true"
          />
        ) : null}
      </button>
      {!collapsed ? (
        <ul className="mt-0.5 space-y-0.5 pl-1.5">
          {group.items.map((item) => {
            const active = isNavItemActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`block rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atlas-signal)] ${
                    inverse
                      ? active
                        ? "bg-white/15 text-white shadow-[inset_2px_0_0_var(--atlas-signal)]"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                      : active
                        ? "bg-[color-mix(in_srgb,var(--atlas-signal)_12%,var(--surface-muted))] text-[var(--atlas-signal)] shadow-[inset_2px_0_0_var(--atlas-signal)]"
                        : "text-[var(--atlas-text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--atlas-text)]"
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
