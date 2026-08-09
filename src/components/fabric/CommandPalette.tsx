"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import { listProducts } from "@/lib/products/registry";

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  href?: string;
  action?: () => void;
  group: string;
};

type CommandPaletteProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When true, Ctrl/Cmd+K opens the palette (Atlas default). */
  preferPlainShortcut?: boolean;
};

const RECENT_KEY = "atlas-search-recent";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return;
  try {
    const next = [trimmed, ...loadRecent().filter((x) => x !== trimmed)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * Permission-aware command palette with plain-language destinations.
 * Navigates existing routes / toggles theme only — no unsupported mutations.
 */
export function CommandPalette({
  open: openControlled,
  onOpenChange,
  preferPlainShortcut = true,
}: CommandPaletteProps = {}) {
  const [openUncontrolled, setOpenUncontrolled] = useState(false);
  const open = openControlled ?? openUncontrolled;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    onOpenChange?.(value);
    if (openControlled === undefined) setOpenUncontrolled(value);
  };

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { state, hasPermission } = useDocumentationAuth();
  const products = listProducts();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isK = e.key.toLowerCase() === "k";
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !isK) {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      if (preferPlainShortcut) {
        if (e.shiftKey) return;
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) {
            setQuery("");
            setActive(0);
            setRecent(loadRecent());
          }
          return next;
        });
        return;
      }
      if (e.shiftKey) {
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) {
            setQuery("");
            setActive(0);
            setRecent(loadRecent());
          }
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpen is stable enough for shortcut wiring
  }, [preferPlainShortcut]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const items = useMemo(() => {
    const list: CommandItem[] = [
      { id: "home", label: "Overview", hint: "Intelligence Field", href: "/", group: "Home" },
      { id: "guides", label: "Guides", href: "/guides", group: "Learn" },
      { id: "changelog", label: "Changelog", href: "/changelog", group: "Learn" },
      {
        id: "auth",
        label: "Credentials",
        href: "/authentication",
        group: "Account",
      },
      {
        id: "developer",
        label: "API Explorer",
        hint: "Live Console",
        href: "/developer",
        group: "Work",
      },
      {
        id: "theme",
        label: "Toggle theme",
        group: "Account",
        action: () => {
          document.documentElement.classList.toggle("dark");
          const next = document.documentElement.classList.contains("dark") ? "dark" : "light";
          try {
            localStorage.setItem("theme", next);
          } catch {
            /* ignore */
          }
        },
      },
    ];

    for (const p of products) {
      list.push({
        id: `docs-${p.productId}`,
        label: `${p.displayLabel} documentation`,
        href: `/docs/${p.productId}`,
        group: "Learn",
        hint: p.productId,
      });
    }

    const canAsk =
      !state.authenticated ||
      state.canAskAi ||
      (state.authenticated &&
        hasPermission("ask_agent") &&
        state.user?.role !== "viewer");
    if (canAsk) {
      list.push({
        id: "ask",
        label: "Ask AI",
        hint: "Ask Intelligence",
        href: "/agent",
        group: "Work",
      });
      list.push({
        id: "build",
        label: "Build App",
        hint: "Build Studio",
        href: "/agent?focus=build",
        group: "Work",
      });
    }
    if (hasPermission("manage_users")) {
      list.push({
        id: "users",
        label: "Settings · Users",
        href: "/settings/users",
        group: "Account",
      });
    }
    if (hasPermission("sync_docs") || hasPermission("manage_sources")) {
      list.push({
        id: "content",
        label: "Content sources",
        href: "/settings/content",
        group: "Account",
      });
    }
    if (
      state.authenticated &&
      state.user &&
      (state.enterpriseCapabilities.includes("admin_dashboard.access") ||
        state.user.role === "owner" ||
        state.user.role === "admin" ||
        state.user.role === "developer")
    ) {
      list.push({
        id: "admin",
        label: "Admin",
        hint: "Control Plane",
        href: "/admin",
        group: "Manage",
      });
      list.push({
        id: "analytics",
        label: "Analytics",
        hint: "Signal Telemetry",
        href: "/admin/documentation-agent/query-analytics",
        group: "Manage",
      });
      list.push({
        id: "unanswered",
        label: "Unanswered Queries",
        hint: "Unknown Signals",
        href: "/admin/documentation-agent/unanswered",
        group: "Manage",
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.hint?.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [products, state, hasPermission, query]);

  function run(item: CommandItem) {
    if (query.trim()) pushRecent(query);
    setOpen(false);
    if (item.action) item.action();
    if (item.href && item.href !== pathname) router.push(item.href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-[var(--surface-overlay)] px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      data-testid="command-palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-floating)] shadow-[var(--shadow-modal)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border-subtle)] px-3 py-2">
          <p className="atlas-micro-label mb-1">Search</p>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && items[active]) {
                e.preventDefault();
                run(items[active]);
              }
            }}
            placeholder="Search pages, products, and features…"
            className="w-full bg-transparent px-1 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            aria-label="Search"
          />
        </div>
        {!query.trim() && recent.length > 0 ? (
          <div className="border-b border-[var(--border-subtle)] px-3 py-2">
            <p className="atlas-micro-label mb-1.5">Recent searches</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="rounded-[var(--radius-sm)] border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
                  onClick={() => {
                    setQuery(r);
                    setActive(0);
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <ul className="max-h-80 overflow-y-auto scroll-thin p-2" role="listbox">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
              No matches. Try another term, or open Documentation from Learn in the sidebar.
            </li>
          ) : (
            items.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm ${
                    index === active
                      ? "bg-[color-mix(in_srgb,var(--atlas-signal)_12%,var(--surface-muted))] text-[var(--text-heading)] shadow-[inset_2px_0_0_var(--atlas-signal)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(item)}
                >
                  <span>
                    <span className="block font-medium">{item.label}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {item.group}
                      {item.hint ? ` · ${item.hint}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-[var(--border-subtle)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Esc close · ↑↓ move · Enter open · Ctrl/⌘K toggle
        </p>
      </div>
    </div>
  );
}
