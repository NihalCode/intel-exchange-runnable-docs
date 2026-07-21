"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavNode } from "@/lib/types";
import { authReturnToFromPath } from "@/lib/documentation-auth/auth-return-to-path";
import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import { ProductSelector, useProduct } from "./ProductContext";
import { ProductRunSettingsSync } from "./RunSettings";
import { Sidebar } from "./Sidebar";
import { useFocusTrap } from "./useFocusTrap";

function WorkspaceSettingsLink() {
  const pathname = usePathname();
  const { state, hasPermission } = useDocumentationAuth();
  const show = !state.loading && hasPermission("manage_users");
  if (!show) return null;

  const active = pathname.startsWith("/settings/users");
  return (
    <Link
      href="/settings/users"
      className={`hidden rounded-md px-2 py-1 text-xs font-medium sm:inline ${
        active
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
      }`}
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
      className={`hidden rounded-md px-2 py-1 text-xs font-medium sm:inline ${
        active
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
      }`}
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
      className={`rounded-md px-2 py-1 text-xs font-medium ${
        active
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
      }`}
    >
      Admin
    </Link>
  );
}

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
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* ignore */ }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** Signed-out: Sign in link matching header nav. Signed-in: avatar â†’ logout. */
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
        className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
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
      title={`${label} â€” sign out`}
      aria-label={`${label} â€” sign out`}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/80 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-700"
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
        className={`rounded-md px-2 py-1 text-xs ${className} ${
          active
            ? "bg-sky-100 font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        }`}
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
  const [nav, setNav] = useState<NavNode[]>(() =>
    productId === "ctix" ? initialNav : []
  );

  useEffect(() => {
    let cancelled = false;
    // Drop CTIX SSR nav immediately when the active product is not CTIX.
    if (productId !== "ctix") {
      setNav([]);
    } else {
      setNav(initialNav);
    }
    async function loadNav() {
      try {
        const res = await fetch(`/api/products/${productId}`);
        if (!res.ok) {
          if (!cancelled && productId === "ctix") setNav(initialNav);
          else if (!cancelled) setNav([]);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.manifest?.nav) setNav(data.manifest.nav);
        else if (productId === "ctix") setNav(initialNav);
        else setNav([]);
      } catch {
        if (!cancelled && productId === "ctix") setNav(initialNav);
        else if (!cancelled) setNav([]);
      }
    }
    void loadNav();
    return () => {
      cancelled = true;
    };
    // Intentionally omit initialNav: a new array identity from the layout would
    // cancel in-flight product nav fetches and leave the CTIX SSR tree stuck.
  }, [productId]);

  const { currentSlug, activeProductId } = parseDocsPath(pathname);
  const sidebarProductId = activeProductId ?? productId;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useFocusTrap(drawerOpen, () => setDrawerOpen(false));

  return (
    <div className="flex min-h-screen flex-col">
      <ProductRunSettingsSync />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-zinc-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Toggle navigation"
          aria-expanded={drawerOpen}
          aria-controls="documentation-navigation-drawer"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 lg:hidden dark:border-zinc-700"
        >
          <MenuIcon />
        </button>

        <Link href="/" className="flex shrink-0 items-center gap-1.5">
          <span className="hidden text-sm font-semibold sm:inline">Cyware Documentation</span>
        </Link>

        <ProductSelector className="hidden md:flex" />

        <Link
          href="/agent"
          className={`hidden rounded-md px-2 py-1 text-xs font-medium sm:inline ${
            pathname === "/agent"
              ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          }`}
        >
          Ask AI
        </Link>

        <WorkspaceSettingsLink />

        <WorkspaceContentLink />

        <EnterpriseAdminLink />

        <HeaderBar />
        <ThemeToggle />
        <AuthHeaderControl />
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-zinc-200 lg:block dark:border-zinc-800">
          <div className="sticky top-[49px] h-[calc(100vh-49px)]">
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
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
            <aside
              ref={drawerRef}
              id="documentation-navigation-drawer"
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Documentation navigation"
              className="absolute left-0 top-0 h-full w-80 max-w-[85%] border-r border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
            >
              <ProductSelector className="border-b border-zinc-200 p-3 dark:border-zinc-800" />
              <Sidebar
                nav={nav}
                currentSlug={currentSlug}
                productId={sidebarProductId}
                onNavigate={() => setDrawerOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function parseDocsPath(pathname: string): { currentSlug: string; activeProductId: string | null } {
  if (!pathname.startsWith("/docs/")) return { currentSlug: "", activeProductId: null };
  const rest = decodeURIComponent(pathname.slice("/docs/".length));
  const parts = rest.split("/");
  const known = ["ctix", "csap", "orchestrate", "cftr"];
  if (known.includes(parts[0])) {
    return { activeProductId: parts[0], currentSlug: parts.slice(1).join("/") };
  }
  return { activeProductId: "ctix", currentSlug: rest };
}

/* Icons */
function MenuIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" /></svg>;
}
function SunIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 14a5 5 0 100-10 5 5 0 000 10zm9-5a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5 12a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zm12.95 6.95a1 1 0 01-1.41 0l-.71-.71a1 1 0 111.41-1.41l.71.71a1 1 0 010 1.41zM7.76 7.76a1 1 0 01-1.41 0l-.71-.71A1 1 0 117.05 5.64l.71.71a1 1 0 010 1.41zm0 8.48a1 1 0 010 1.41l-.71.71a1 1 0 01-1.41-1.41l.71-.71a1 1 0 011.41 0zm9.19-9.19a1 1 0 010-1.41l.71-.71a1 1 0 111.41 1.41l-.71.71a1 1 0 01-1.41 0zM12 19a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" /></svg>;
}
function MoonIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>;
}
