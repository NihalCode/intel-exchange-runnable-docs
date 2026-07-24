"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavNode } from "@/lib/types";
import { authReturnToFromPath } from "@/lib/documentation-auth/auth-return-to-path";
import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import { ProductSelector, useProduct } from "./ProductContext";
import { ProductRunSettingsSync } from "./RunSettings";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useFocusTrap } from "./useFocusTrap";
import { DocsSearch } from "@/components/DocsSearch";
import { CxFooter } from "@/components/cx";
import { CommandPalette } from "@/components/fabric/CommandPalette";
import {
  navLinkActiveClass,
  navLinkClass,
} from "@/components/admin/ui/tokens";

function AskAiNavLink({ pathname }: { pathname: string }) {
  const { state, hasPermission } = useDocumentationAuth();
  if (state.loading) return null;
  const allowed =
    state.canAskAi ||
    (state.authenticated &&
      hasPermission("ask_agent") &&
      state.user?.role !== "viewer");
  if (!allowed) return null;

  const active = pathname === "/agent" || pathname.startsWith("/agent/");
  return (
    <Link
      href="/agent"
      data-testid="nav-ask-ai"
      className={active ? navLinkActiveClass : navLinkClass}
    >
      Ask AI
    </Link>
  );
}

function WorkspaceSettingsLink() {
  const pathname = usePathname();
  const { state, hasPermission } = useDocumentationAuth();
  const show = !state.loading && hasPermission("manage_users");
  if (!show) return null;

  const active = pathname.startsWith("/settings/users");
  return (
    <Link
      href="/settings/users"
      data-testid="nav-settings"
      className={`hidden lg:inline ${active ? navLinkActiveClass : navLinkClass}`}
    >
      Settings
    </Link>
  );
}

function WorkspaceContentLink() {
  const pathname = usePathname();
  const { state, hasPermission } = useDocumentationAuth();
  const show =
    !state.loading && (hasPermission("sync_docs") || hasPermission("manage_sources"));
  if (!show) return null;

  const active = pathname.startsWith("/settings/content");
  return (
    <Link
      href="/settings/content"
      data-testid="nav-content"
      className={`hidden lg:inline ${active ? navLinkActiveClass : navLinkClass}`}
    >
      Content
    </Link>
  );
}

function MobileDrawerWorkspaceLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  const { state, hasPermission } = useDocumentationAuth();
  if (state.loading) return null;

  const links: Array<{ href: string; label: string; show: boolean }> = [
    {
      href: "/agent",
      label: "Ask AI",
      show:
        state.canAskAi ||
        (state.authenticated &&
          hasPermission("ask_agent") &&
          state.user?.role !== "viewer"),
    },
    {
      href: "/settings/users",
      label: "Settings",
      show: hasPermission("manage_users"),
    },
    {
      href: "/settings/content",
      label: "Content",
      show: hasPermission("sync_docs") || hasPermission("manage_sources"),
    },
    {
      href: "/admin",
      label: "Admin",
      show:
        state.authenticated &&
        !!state.user &&
        (state.enterpriseCapabilities.includes("admin_dashboard.access") ||
          state.user.role === "owner" ||
          state.user.role === "admin" ||
          state.user.role === "developer"),
    },
    { href: "/authentication", label: "Authentication", show: true },
  ];

  const visible = links.filter((l) => l.show);
  if (!visible.length) return null;

  return (
    <nav
      aria-label="Workspace shortcuts"
      className="border-t border-[var(--border-subtle)] p-3 lg:hidden"
      data-testid="mobile-drawer-workspace"
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Workspace
      </p>
      <ul className="space-y-1">
        {visible.map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== "/" && pathname.startsWith(`${link.href}/`));
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={onNavigate}
                className={`block rounded-[var(--radius-md)] px-2 py-1.5 text-sm ${
                  active ? navLinkActiveClass : navLinkClass
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function EnterpriseAdminLink() {
  const pathname = usePathname();
  const { state } = useDocumentationAuth();
  const showAdmin =
    !state.loading &&
    state.authenticated &&
    state.user &&
    (state.enterpriseCapabilities.includes("admin_dashboard.access") ||
      state.user.role === "owner" ||
      state.user.role === "admin" ||
      state.user.role === "developer");
  if (!showAdmin) return null;
  const active = pathname.startsWith("/admin");
  return (
    <Link
      href="/admin"
      data-testid="nav-admin"
      className={`hidden md:inline ${active ? navLinkActiveClass : navLinkClass}`}
    >
      Admin
    </Link>
  );
}

function AuthHeaderControl() {
  const pathname = usePathname();
  const { state } = useDocumentationAuth();

  if (state.loading) {
    return (
      <span
        className="inline-block h-8 w-14 shrink-0"
        aria-hidden="true"
        data-testid="auth-header-loading"
      />
    );
  }

  if (!state.authenticated || !state.user) {
    // Invite/identity failures leave an Auth0 cookie; silent /auth/login would
    // bounce straight back to /access/*. Prefer the branded interstitial.
    const deniedReason = state.accessDenied?.reason;
    const signInHref = deniedReason
      ? `/sign-in?error=${encodeURIComponent(
          deniedReason === "wrong_invite_email"
            ? "wrong_email"
            : deniedReason === "expired_invite"
              ? "expired_invite"
              : deniedReason === "disabled"
                ? "disabled"
                : deniedReason === "invite_required"
                  ? "invite_required"
                  : "auth_denied"
        )}`
      : `/sign-in?returnTo=${encodeURIComponent(authReturnToFromPath(pathname))}`;
    return (
      <Link
        href={signInHref}
        data-testid="auth-header-sign-in"
        className="inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
      >
        Sign in
      </Link>
    );
  }

  const label = state.user.name || state.user.email;
  return (
    <Link
      href="/auth/logout"
      data-testid="auth-header-profile"
      title={`${label} — sign out`}
      aria-label={`${label} — sign out`}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-semibold text-[var(--text-heading)] ring-1 ring-[var(--border-subtle)] hover:bg-[var(--surface-sunken)]"
    >
      {label.slice(0, 1).toUpperCase()}
    </Link>
  );
}

function PrimaryNav({ pathname }: { pathname: string }) {
  const item = (href: string, label: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
    return (
      <Link
        href={href}
        className={`rounded-[var(--radius-sm)] px-2 py-1 text-sm ${
          active ? navLinkActiveClass : navLinkClass
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Primary navigation"
      data-layout="cx-primary-nav"
      className="hidden min-w-0 items-center gap-1 md:flex"
    >
      {item("/", "Home")}
      {item("/guides", "Guides")}
      {item("/changelog", "Changelog")}
      {item("/authentication", "Authentication")}
    </nav>
  );
}

export function AppFrame({
  nav: initialNav,
  children,
}: {
  nav: NavNode[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { productId } = useProduct();
  const [remoteNav, setRemoteNav] = useState<{
    productId: string;
    nav: NavNode[];
  } | null>(null);
  const nav =
    remoteNav?.productId === productId
      ? remoteNav.nav
      : productId === "ctix"
        ? initialNav
        : [];

  useEffect(() => {
    let cancelled = false;
    async function loadNav() {
      try {
        const res = await fetch(`/api/products/${productId}`);
        if (!res.ok) {
          if (cancelled) return;
          setRemoteNav({
            productId,
            nav: productId === "ctix" ? initialNav : [],
          });
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.manifest?.nav) {
          setRemoteNav({ productId, nav: data.manifest.nav });
        } else {
          setRemoteNav({
            productId,
            nav: productId === "ctix" ? initialNav : [],
          });
        }
      } catch {
        if (cancelled) return;
        setRemoteNav({
          productId,
          nav: productId === "ctix" ? initialNav : [],
        });
      }
    }
    void loadNav();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- productId is the intentional trigger
  }, [productId]);

  const { currentSlug, activeProductId } = parseDocsPath(pathname);
  const sidebarProductId = activeProductId ?? productId;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useFocusTrap(drawerOpen, () => setDrawerOpen(false));
  const isDocsRoute = pathname.startsWith("/docs/");
  const isHome = pathname === "/";
  const isAskAi = pathname === "/agent" || pathname.startsWith("/agent/");
  const showDocsRail = isDocsRoute;

  return (
    <div className="cx-app-shell" data-testid="app-frame" data-layout="cx-app-shell">
      <ProductRunSettingsSync />
      <CommandPalette />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="cx-header sticky top-0 z-30" data-layout="cx-header">
        <div className="cx-header-zones" data-layout="cx-header-zones">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen((o) => !o)}
              aria-label="Toggle navigation"
              aria-expanded={drawerOpen}
              aria-controls="documentation-navigation-drawer"
              data-testid="nav-drawer-toggle"
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] lg:hidden"
            >
              <MenuIcon />
            </button>

            <Link
              href="/"
              className="flex shrink-0 items-center gap-2"
              data-testid="brand-home"
              data-layout="cx-brand"
            >
              <span className="relative flex h-8 w-8 items-center justify-center">
                <span
                  className="absolute inset-0 rounded-[var(--radius-md)]"
                  style={{
                    background:
                      "color-mix(in srgb, var(--product-accent, var(--brand-blue)) 14%, transparent)",
                  }}
                  aria-hidden="true"
                />
                <Image
                  src="/cyware_logo.png"
                  alt=""
                  width={28}
                  height={28}
                  className="relative h-7 w-7 object-contain"
                  priority
                />
              </span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className="text-sm font-semibold tracking-tight text-[var(--text-heading)]">
                  CYWARE
                </span>
                <span className="text-[var(--border-strong)]" aria-hidden="true">
                  |
                </span>
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  Documentation
                </span>
              </span>
            </Link>
          </div>

          <PrimaryNav pathname={pathname} />

          <div
            className="flex min-w-0 items-center justify-end gap-2"
            data-layout="cx-header-actions"
          >
            <div className="hidden w-56 xl:block">
              <DocsSearch
                className="w-full"
                placeholder="Search docs"
                size="compact"
              />
            </div>
            <AskAiNavLink pathname={pathname} />
            <WorkspaceSettingsLink />
            <WorkspaceContentLink />
            <EnterpriseAdminLink />
            <ThemeToggle />
            <AuthHeaderControl />
          </div>
        </div>
      </header>

      <div className="cx-product-strip" data-layout="cx-product-strip">
        <span
          className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--product-accent,var(--accent-primary))] sf-signal-pulse"
          aria-hidden="true"
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Product context
        </span>
        <ProductSelector className="flex" />
        <span className="ml-auto hidden items-center gap-3 sm:flex">
          <kbd className="rounded border border-[var(--border-default)] bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            Ctrl+K
          </kbd>
          {isDocsRoute ? (
            <Link
              href={`/docs/${sidebarProductId}`}
              className="text-xs font-medium text-[var(--text-link)] hover:underline"
            >
              API documentation
            </Link>
          ) : null}
        </span>
      </div>

      <div className="cx-docs-body">
        {showDocsRail ? (
          <aside
            className="hidden w-[var(--sidebar-width)] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] lg:block"
            data-layout="cx-docs-left-rail"
          >
            <div className="sticky top-[calc(var(--header-height)+var(--product-strip-height))] h-[calc(100vh-var(--header-height)-var(--product-strip-height))]">
              <Sidebar
                nav={nav}
                currentSlug={currentSlug}
                productId={sidebarProductId}
                onNavigate={() => {}}
              />
            </div>
          </aside>
        ) : null}

        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-[var(--surface-overlay)]"
              onClick={() => setDrawerOpen(false)}
            />
            <aside
              ref={drawerRef}
              id="documentation-navigation-drawer"
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Documentation navigation"
              data-layout="cx-mobile-drawer"
              className="absolute left-0 top-0 flex h-full w-80 max-w-[90%] flex-col border-r border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[var(--shadow-drawer)]"
            >
              <div className="border-b border-[var(--border-subtle)] p-3">
                <ProductSelector className="w-full" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Sidebar
                  nav={nav}
                  currentSlug={currentSlug}
                  productId={sidebarProductId}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>
              <MobileDrawerWorkspaceLinks
                pathname={pathname}
                onNavigate={() => setDrawerOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="main-content"
            tabIndex={-1}
            data-layout="cx-main"
            className={`min-w-0 flex-1 ${
              isHome ? "" : isAskAi ? "px-3 py-3 sm:px-5 sm:py-4" : "px-4 py-6 sm:px-8"
            }`}
          >
            {children}
          </main>
          {isHome || pathname.startsWith("/guides") || pathname === "/changelog" ? (
            <CxFooter />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function parseDocsPath(pathname: string): {
  currentSlug: string;
  activeProductId: string | null;
} {
  if (!pathname.startsWith("/docs/")) return { currentSlug: "", activeProductId: null };
  const rest = decodeURIComponent(pathname.slice("/docs/".length));
  const parts = rest.split("/");
  const known = ["ctix", "csap", "orchestrate", "cftr"];
  if (known.includes(parts[0])) {
    return { activeProductId: parts[0], currentSlug: parts.slice(1).join("/") };
  }
  return { activeProductId: "ctix", currentSlug: rest };
}

function MenuIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}
