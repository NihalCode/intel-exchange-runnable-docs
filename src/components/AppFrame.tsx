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
      className={`hidden sm:inline ${active ? navLinkActiveClass : navLinkClass}`}
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
      className={`hidden sm:inline ${active ? navLinkActiveClass : navLinkClass}`}
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
      className={`hidden sm:inline ${active ? navLinkActiveClass : navLinkClass}`}
    >
      Content
    </Link>
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
      className={active ? navLinkActiveClass : navLinkClass}
    >
      Admin
    </Link>
  );
}

/** Signed-out: Sign in link. Signed-in: avatar → logout. */
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
    const returnTo = encodeURIComponent(authReturnToFromPath(pathname));
    return (
      <Link
        href={`/auth/login?returnTo=${returnTo}`}
        data-testid="auth-header-sign-in"
        className={navLinkClass}
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

function HeaderBar() {
  const pathname = usePathname();
  const navLink = (href: string, label: string, className = "hidden md:inline") => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
    return (
      <Link
        href={href}
        className={`${className} ${active ? navLinkActiveClass : navLinkClass}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav aria-label="Primary navigation" className="relative flex min-w-0 flex-1 items-center justify-end gap-1">
      {navLink("/", "Documentation")}
      {navLink("/docs/ctix", "API Reference")}
      {navLink("/guides", "Guides", "hidden lg:inline")}
      {navLink("/changelog", "Changelog", "hidden xl:inline")}
      {navLink("/authentication", "Authentication", "inline font-medium")}
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

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background-page)]" data-testid="app-frame">
      <ProductRunSettingsSync />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="cx-header sticky top-0 z-30 flex items-center gap-2 px-3">
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Toggle navigation"
          aria-expanded={drawerOpen}
          aria-controls="documentation-navigation-drawer"
          data-testid="nav-drawer-toggle"
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] lg:hidden"
        >
          <MenuIcon />
        </button>

        <Link
          href="/"
          className="flex shrink-0 items-center gap-2"
          data-testid="brand-home"
        >
          <Image
            src="/cyware_logo.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
            priority
          />
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="text-sm font-semibold tracking-tight text-[var(--text-heading)]">
              Cyware
            </span>
            <span className="text-[var(--border-strong)]" aria-hidden="true">
              |
            </span>
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Documentation
            </span>
          </span>
        </Link>

        <ProductSelector className="hidden md:flex" />

        <AskAiNavLink pathname={pathname} />
        <WorkspaceSettingsLink />
        <WorkspaceContentLink />
        <EnterpriseAdminLink />

        <HeaderBar />
        <ThemeToggle />
        <AuthHeaderControl />
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-[var(--sidebar-width)] shrink-0 border-r border-[var(--border-subtle)] lg:block">
          <div className="sticky top-[var(--header-height)] h-[calc(100vh-var(--header-height))]">
            <Sidebar
              nav={nav}
              currentSlug={currentSlug}
              productId={sidebarProductId}
              onNavigate={() => {}}
            />
          </div>
        </aside>

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
              className="absolute left-0 top-0 h-full w-80 max-w-[85%] border-r border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[var(--shadow-drawer)]"
            >
              <ProductSelector className="border-b border-[var(--border-subtle)] p-3" />
              <Sidebar
                nav={nav}
                currentSlug={currentSlug}
                productId={sidebarProductId}
                onNavigate={() => setDrawerOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 sm:px-8"
        >
          {children}
        </main>
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
