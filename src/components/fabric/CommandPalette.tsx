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

/**
 * Permission-aware command palette (Cmd/Ctrl+K).
 * Navigates existing routes / toggles theme only — no unsupported mutations.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { state, hasPermission } = useDocumentationAuth();
  const products = listProducts();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) {
            setQuery("");
            setActive(0);
          }
          return next;
        });
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const items = useMemo(() => {
    const list: CommandItem[] = [
      { id: "home", label: "Home", href: "/", group: "Navigate" },
      { id: "guides", label: "Guides", href: "/guides", group: "Navigate" },
      { id: "changelog", label: "Changelog", href: "/changelog", group: "Navigate" },
      {
        id: "auth",
        label: "Authentication / credentials",
        href: "/authentication",
        group: "Navigate",
      },
      {
        id: "theme",
        label: "Toggle theme",
        group: "Workspace",
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
        group: "Products",
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
      list.push({ id: "ask", label: "Ask AI", href: "/agent", group: "Workspace" });
    }
    if (hasPermission("manage_users")) {
      list.push({
        id: "users",
        label: "Users",
        href: "/settings/users",
        group: "Workspace",
      });
    }
    if (hasPermission("sync_docs") || hasPermission("manage_sources")) {
      list.push({
        id: "content",
        label: "Content management",
        href: "/settings/content",
        group: "Workspace",
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
      list.push({ id: "admin", label: "Admin control plane", href: "/admin", group: "Workspace" });
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
      aria-label="Command palette"
      data-testid="command-palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--surface-floating)] shadow-[var(--shadow-modal)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border-subtle)] px-3 py-2">
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
            placeholder="Search routes and workspace actions…"
            className="w-full bg-transparent px-1 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            aria-label="Command search"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto scroll-thin p-2" role="listbox">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
              No matching commands
            </li>
          ) : (
            items.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-2 text-left text-sm ${
                    index === active
                      ? "bg-[var(--surface-muted)] text-[var(--text-heading)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(item)}
                >
                  <span>
                    <span className="block font-medium">{item.label}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{item.group}</span>
                  </span>
                  {item.hint ? (
                    <span className="font-mono text-[10px] uppercase text-[var(--text-muted)]">
                      {item.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-[var(--border-subtle)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
          Esc to close · ↑↓ to move · Enter to open
        </p>
      </div>
    </div>
  );
}
