"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavNode } from "@/lib/types";
import { useRunSettings } from "./RunSettings";
import { Sidebar } from "./Sidebar";

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved ? saved === "dark" : prefers;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {dark ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 14a5 5 0 100-10 5 5 0 000 10zm9-5a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5 12a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zm12.95 6.95a1 1 0 01-1.41 0l-.71-.71a1 1 0 111.41-1.41l.71.71a1 1 0 010 1.41zM7.76 7.76a1 1 0 01-1.41 0l-.71-.71A1 1 0 117.05 5.64l.71.71a1 1 0 010 1.41zm0 8.48a1 1 0 010 1.41l-.71.71a1 1 0 01-1.41-1.41l.71-.71a1 1 0 011.41 0zm9.19-9.19a1 1 0 010-1.41l.71-.71a1 1 0 111.41 1.41l-.71.71a1 1 0 01-1.41 0zM12 19a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}

function SettingsBar() {
  const { baseUrl, setBaseUrl, credentialCount, clearCredentials } = useRunSettings();
  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        <span className="hidden sm:inline">Base URL</span>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://your-tenant.com/ctixapi"
          className="w-48 rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-sky-500 sm:w-64 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {credentialCount > 0 ? (
        <button
          type="button"
          onClick={clearCredentials}
          className="inline-flex items-center gap-1 rounded-md border border-amber-400/60 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
          title="Clear all in-memory credentials"
        >
          {credentialCount} secret{credentialCount > 1 ? "s" : ""} · clear
        </button>
      ) : null}
    </div>
  );
}

export function AppShell({
  nav,
  children,
}: {
  nav: NavNode[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentSlug = pathname.startsWith("/docs/")
    ? decodeURIComponent(pathname.slice("/docs/".length))
    : "";
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Toggle navigation"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 lg:hidden dark:border-zinc-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="hidden text-sm sm:inline">Intel Exchange API</span>
          <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            RUNNABLE
          </span>
        </Link>
        <SettingsBar />
        <ThemeToggle />
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 shrink-0 border-r border-zinc-200 lg:block dark:border-zinc-800">
          <div className="sticky top-[49px] h-[calc(100vh-49px)]">
            <Sidebar nav={nav} currentSlug={currentSlug} onNavigate={() => {}} />
          </div>
        </aside>

        {/* Mobile drawer */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-80 max-w-[85%] border-r border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
              <Sidebar
                nav={nav}
                currentSlug={currentSlug}
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
