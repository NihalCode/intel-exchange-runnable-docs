"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavNode } from "@/lib/types";
import { DISPLAY_BASE, DOCS_REFERENCE_URL } from "@/lib/constants";
import { useRunSettings } from "./RunSettings";
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

function AuthPanel({ onClose }: { onClose: () => void }) {
  const {
    baseUrl, setBaseUrl,
    accessId, setAccessId,
    secretKey, setSecretKey,
    generateAuth, authStatus, authError,
    clearCredentials, credentialCount,
    getCredential,
  } = useRunSettings();

  const sig = getCredential("signature");
  const exp = getCredential("expires");

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-[min(480px,95vw)] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">API Connection Settings</h2>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
          <CloseIcon />
        </button>
      </div>

      <p className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
        Official API reference:{" "}
        <a href={DOCS_REFERENCE_URL} className="font-mono underline" target="_blank" rel="noreferrer">
          ctixapiv3…/intel-exchange-api-reference
        </a>
        . <strong>Run</strong> calls the Open API base below (from your CTIX Integrators CSV), not the docs page URL.
      </p>

      {/* Base URL */}
      <label className="mb-3 flex flex-col gap-1 text-xs">
        <span className="font-semibold">Cyware tenant API base URL</span>
        <span className="text-zinc-500">
          Intel Exchange Open API root, e.g. <code className="text-sky-600">{DISPLAY_BASE}</code>
        </span>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={DISPLAY_BASE}
          spellCheck={false}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-zinc-600 dark:bg-zinc-900"
        />
      </label>

      <div className="mb-2 border-t border-zinc-100 pt-3 dark:border-zinc-800" />

      <p className="mb-2 text-xs font-semibold">Open API Credentials</p>
      <p className="mb-3 text-[11px] text-zinc-500">
        From your Cyware tenant: <strong>Admin → Open API → Generate Credentials</strong>.
        Enter Access ID and Secret Key once — Signature and Expires are generated automatically
        when you click <strong>Run</strong> (refreshed only after they expire).
        Access ID is saved in this browser; Secret Key is kept in session storage for this tab.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Access ID</span>
          <input
            value={accessId}
            onChange={(e) => setAccessId(e.target.value)}
            placeholder="your-access-id"
            spellCheck={false}
            autoComplete="off"
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Secret Key</span>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="your-secret-key"
            spellCheck={false}
            autoComplete="off"
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void generateAuth()}
        disabled={authStatus === "generating"}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-sky-600 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
      >
        {authStatus === "generating" ? (
          <><Spinner /> Generating…</>
        ) : authStatus === "ok" ? (
          <><CheckIcon /> Auth ready — auto-refreshes on Run when expired</>
        ) : (
          <><KeyIcon /> Generate Signature &amp; Expires now (optional)</>
        )}
      </button>

      {authError ? (
        <p className="mt-1 text-[11px] text-red-600">{authError}</p>
      ) : null}

      {authStatus === "ok" && sig ? (
        <div className="mt-2 rounded-md bg-emerald-50 p-2 text-[11px] dark:bg-emerald-950/30">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">✓ Auth ready.</span>
          {" "}Expires: <code>{exp}</code> · Signature: <code>{sig.slice(0, 12)}…</code>
        </div>
      ) : null}

      {credentialCount > 0 ? (
        <button
          type="button"
          onClick={clearCredentials}
          className="mt-2 text-[11px] text-zinc-400 underline hover:text-zinc-600"
        >
          Clear all credentials from memory
        </button>
      ) : null}
    </div>
  );
}

function HeaderBar() {
  const { baseUrl, setBaseUrl, authStatus, credentialCount } = useRunSettings();
  const [panelOpen, setPanelOpen] = useState(false);

  const statusDot =
    authStatus === "ok"
      ? "bg-emerald-500"
      : credentialCount > 0
        ? "bg-amber-500"
        : "bg-zinc-400";

  return (
    <div className="relative flex flex-1 items-center gap-2">
      {/* Compact base URL input */}
      <input
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder={DISPLAY_BASE}
        title="Cyware tenant API base URL"
        spellCheck={false}
        className="hidden w-52 rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-sky-500 sm:block xl:w-72 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        title="API credentials & settings"
      >
        <span className={`h-2 w-2 rounded-full ${statusDot}`} />
        <span className="hidden sm:inline">
          {authStatus === "ok" ? "Auth ready" : "Set credentials"}
        </span>
        <KeyIcon />
      </button>
      {panelOpen && <AuthPanel onClose={() => setPanelOpen(false)} />}
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
          <span className="hidden text-sm font-semibold sm:inline">Intel Exchange API</span>
          <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            RUNNABLE
          </span>
        </Link>

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
            <Sidebar nav={nav} currentSlug={currentSlug} onNavigate={() => {}} />
          </div>
        </aside>

        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-80 max-w-[85%] border-r border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
              <Sidebar nav={nav} currentSlug={currentSlug} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

/* Icons */
function MenuIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" /></svg>;
}
function KeyIcon() {
  return <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="15" r="4" /><path d="M11.3 11.7L21 2" /><path d="M18 5l2 2" /></svg>;
}
function CheckIcon() {
  return <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function CloseIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>;
}
function SunIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 14a5 5 0 100-10 5 5 0 000 10zm9-5a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5 12a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zm12.95 6.95a1 1 0 01-1.41 0l-.71-.71a1 1 0 111.41-1.41l.71.71a1 1 0 010 1.41zM7.76 7.76a1 1 0 01-1.41 0l-.71-.71A1 1 0 117.05 5.64l.71.71a1 1 0 010 1.41zm0 8.48a1 1 0 010 1.41l-.71.71a1 1 0 01-1.41-1.41l.71-.71a1 1 0 011.41 0zm9.19-9.19a1 1 0 010-1.41l.71-.71a1 1 0 111.41 1.41l-.71.71a1 1 0 01-1.41 0zM12 19a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" /></svg>;
}
function MoonIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>;
}
function Spinner() {
  return <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>;
}
