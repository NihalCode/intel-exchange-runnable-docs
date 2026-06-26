"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavNode } from "@/lib/types";
import { isLiveApiUiEnabled } from "@/lib/public-docs-mode";
import { productConnectionUi } from "@/lib/products/connection-ui";
import { ApiConnectionPanel } from "./ApiConnectionPanel";
import { ProductSelector, useProduct } from "./ProductContext";
import { ProductRunSettingsSync, useRunSettings } from "./RunSettings";
import { Sidebar } from "./Sidebar";

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

function HeaderBar() {
  const { productId } = useProduct();
  const ui = productConnectionUi(productId);
  const { credentialsConfigured, authReady } = useRunSettings();

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-2">
      <ApiConnectionPanel compact className="min-w-0" />
      {!isLiveApiUiEnabled() ? (
        <Link
          href="/developer"
          className="hidden shrink-0 text-[11px] text-sky-700 underline sm:inline dark:text-sky-400"
        >
          Admin
        </Link>
      ) : null}
      <span className="hidden shrink-0 text-[10px] text-zinc-400 xl:inline">
        {credentialsConfigured
          ? authReady
            ? `${ui.shortLabel} ready`
            : `Add ${ui.fields.find((f) => f.kind === "secret-key")?.label ?? "Secret Key"}`
          : `Connect ${ui.shortLabel}`}
      </span>
    </div>
  );
}

export function AppShell({
  nav: initialNav,
  children,
}: {
  nav: NavNode[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { productId, product } = useProduct();
  const [nav, setNav] = useState<NavNode[]>(initialNav);

  useEffect(() => {
    let cancelled = false;
    async function loadNav() {
      try {
        const res = await fetch(`/api/products/${productId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.manifest?.nav) setNav(data.manifest.nav);
        else if (!cancelled && productId === "ctix") setNav(initialNav);
        else if (!cancelled) setNav([]);
      } catch {
        if (!cancelled && productId === "ctix") setNav(initialNav);
      }
    }
    void loadNav();
    return () => {
      cancelled = true;
    };
  }, [productId, initialNav]);

  const { currentSlug, activeProductId } = parseDocsPath(pathname);
  const sidebarProductId = activeProductId ?? productId;
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <ProductRunSettingsSync />
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-zinc-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Toggle navigation"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 lg:hidden dark:border-zinc-700"
        >
          <MenuIcon />
        </button>

        <Link href="/" className="flex shrink-0 items-center gap-1.5">
          <span className="hidden text-sm font-semibold sm:inline">Cyware API Docs</span>
          <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            RUNNABLE
          </span>
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
          AI Agent
        </Link>

        <HeaderBar />
        <ThemeToggle />
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
            <div className="absolute left-0 top-0 h-full w-80 max-w-[85%] border-r border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
              <ProductSelector className="border-b border-zinc-200 p-3 dark:border-zinc-800" />
              <Sidebar
                nav={nav}
                currentSlug={currentSlug}
                productId={sidebarProductId}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
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
