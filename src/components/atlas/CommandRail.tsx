"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe2,
  KeyRound,
  LayoutDashboard,
  MessageSquareText,
  RadioTower,
  ScrollText,
  Settings2,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import { useProduct } from "@/components/ProductContext";
import {
  ATLAS_NAV_GROUPS,
  ATLAS_NAV_ITEMS,
  isAtlasNavActive,
  resolveAtlasHref,
  type AtlasNavItem,
  type AtlasNavItemId,
} from "@/components/atlas/nav-model";
import { EtchedDivider } from "@/components/atlas/primitives";

const ICONS: Record<AtlasNavItemId, LucideIcon> = {
  home: Globe2,
  docs: BookOpen,
  ask: MessageSquareText,
  build: Sparkles,
  developer: Terminal,
  admin: LayoutDashboard,
  analytics: Activity,
  unanswered: RadioTower,
  settings: Settings2,
  content: FileText,
  credentials: KeyRound,
  guides: ScrollText,
  changelog: Building2,
};

function useVisibleNavItems(): AtlasNavItem[] {
  const { state, hasPermission } = useDocumentationAuth();

  return ATLAS_NAV_ITEMS.filter((item) => {
    if (state.loading) {
      return ["home", "docs", "credentials", "guides", "changelog", "developer"].includes(item.id);
    }

    switch (item.id) {
      case "ask":
        return (
          !state.authenticated ||
          state.canAskAi ||
          (state.authenticated &&
            hasPermission("ask_agent") &&
            state.user?.role !== "viewer")
        );
      case "build":
        // Build Studio shares /agent; show when Ask AI is allowed (feature gates inside page).
        return (
          !state.authenticated ||
          state.canAskAi ||
          (state.authenticated &&
            hasPermission("ask_agent") &&
            state.user?.role !== "viewer")
        );
      case "settings":
        return hasPermission("manage_users");
      case "content":
        return hasPermission("sync_docs") || hasPermission("manage_sources");
      case "admin":
        return (
          state.authenticated &&
          !!state.user &&
          (state.enterpriseCapabilities.includes("admin_dashboard.access") ||
            state.user.role === "owner" ||
            state.user.role === "admin" ||
            state.user.role === "developer")
        );
      case "analytics":
      case "unanswered":
        return (
          state.authenticated &&
          !!state.user &&
          (state.enterpriseCapabilities.includes("admin_dashboard.access") ||
            state.user.role === "owner" ||
            state.user.role === "admin" ||
            state.user.role === "developer")
        );
      default:
        return true;
    }
  });
}

export function CommandRail({
  collapsed,
  onToggleCollapsed,
  mobile = false,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { productId } = useProduct();
  const { state } = useDocumentationAuth();
  const items = useVisibleNavItems();

  const role = state.user?.role ?? (state.authenticated ? "member" : "viewer");
  const identity = state.user?.name || state.user?.email || "Anonymous";

  return (
    <aside
      className={`atlas-command-rail ${collapsed && !mobile ? "atlas-command-rail--collapsed" : ""} ${
        mobile ? "atlas-command-rail--mobile" : ""
      }`}
      data-testid="atlas-command-rail"
      data-collapsed={collapsed && !mobile ? "true" : "false"}
      aria-label="Command rail"
    >
      <div className="atlas-command-rail__brand">
        <Link href="/" className="atlas-command-rail__logo" data-testid="brand-home" onClick={onNavigate}>
          <span className="atlas-command-rail__mark" aria-hidden="true">
            LS
          </span>
          {(!collapsed || mobile) && (
            <span className="atlas-command-rail__title">
              <span className="atlas-micro-label">Cyware</span>
              <span className="atlas-command-rail__name">Living Signal Atlas</span>
            </span>
          )}
        </Link>
        {!mobile && onToggleCollapsed ? (
          <button
            type="button"
            className="atlas-icon-btn"
            aria-label={collapsed ? "Expand command rail" : "Collapse command rail"}
            data-testid="atlas-rail-collapse"
            onClick={onToggleCollapsed}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        ) : null}
      </div>

      <EtchedDivider />

      <div className="atlas-command-rail__groups">
        {ATLAS_NAV_GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.group === group.id);
          if (!groupItems.length) return null;
          return (
            <div key={group.id} className="atlas-command-rail__group">
              {(!collapsed || mobile) && (
                <p className="atlas-micro-label atlas-command-rail__group-label">{group.label}</p>
              )}
              <ul className="atlas-command-rail__list">
                {groupItems.map((item) => {
                  const href = resolveAtlasHref(item, productId);
                  const active = isAtlasNavActive(pathname, item, href, search);
                  const Icon = ICONS[item.id];
                  const ariaLabel = item.atmosphere
                    ? `${item.label} (${item.atmosphere})`
                    : item.label;
                  return (
                    <li key={item.id}>
                      <Link
                        href={href}
                        data-testid={item.testId}
                        data-active={active ? "true" : "false"}
                        title={ariaLabel}
                        aria-label={ariaLabel}
                        aria-current={active ? "page" : undefined}
                        onClick={onNavigate}
                        className={`atlas-rail-link ${active ? "atlas-rail-link--active" : ""}`}
                      >
                        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                        {(!collapsed || mobile) && (
                          <span className="atlas-rail-link__text">
                            <span className="atlas-rail-link__label">{item.label}</span>
                            {item.atmosphere ? (
                              <span className="atlas-rail-link__atmosphere">{item.atmosphere}</span>
                            ) : null}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="atlas-command-rail__footer">
        <EtchedDivider />
        <div className="atlas-command-rail__identity" data-testid="atlas-rail-identity">
          <span className="atlas-command-rail__avatar" aria-hidden="true">
            {identity.slice(0, 1).toUpperCase()}
          </span>
          {(!collapsed || mobile) && (
            <span className="min-w-0">
              <span className="atlas-command-rail__identity-name truncate">{identity}</span>
              <span className="atlas-micro-label">Clearance · {role}</span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
