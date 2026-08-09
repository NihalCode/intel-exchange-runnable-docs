"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { NavNode } from "@/lib/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-[var(--success)]",
  POST: "text-[var(--atlas-signal)]",
  PUT: "text-[var(--atlas-amber)]",
  PATCH: "text-[var(--atlas-violet)]",
  DELETE: "text-[var(--danger)]",
};

function MethodTag({ method }: { method: string | null }) {
  if (!method) return null;
  return (
    <span
      className={`mr-1.5 font-mono text-[10px] font-bold ${METHOD_COLORS[method] || "text-[var(--text-muted)]"}`}
    >
      {method}
    </span>
  );
}

function NavItem({
  node,
  currentSlug,
  depth,
  onNavigate,
  productId,
}: {
  node: NavNode;
  currentSlug: string;
  depth: number;
  onNavigate: () => void;
  productId: string;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isActive = node.slug === currentSlug;
  const containsActive =
    currentSlug === node.slug || currentSlug.startsWith(node.slug + "/");
  const [open, setOpen] = useState(containsActive);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-[var(--radius-sm)] pr-1 ${
          isActive
            ? "bg-[color-mix(in_srgb,var(--atlas-signal)_12%,var(--surface-muted))] shadow-[inset_2px_0_0_var(--atlas-signal)]"
            : "hover:bg-[var(--surface-muted)]"
        }`}
        style={{ paddingLeft: `${depth * 10 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.title}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-heading)]"
          >
            <svg
              className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9 6l6 6-6 6z" />
            </svg>
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <Link
          href={`/docs/${productId}/${node.slug}`}
          onClick={onNavigate}
          className={`flex-1 truncate py-1 text-[13px] ${
            isActive
              ? "font-semibold text-[var(--text-heading)]"
              : "text-[var(--text-secondary)]"
          }`}
          title={node.title}
        >
          <MethodTag method={node.method} />
          {node.title}
        </Link>
      </div>
      {hasChildren && open ? (
        <div>
          {node.children.map((child) => (
            <NavItem
              key={child.slug}
              node={child}
              currentSlug={currentSlug}
              depth={depth + 1}
              onNavigate={onNavigate}
              productId={productId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function flatten(nodes: NavNode[], acc: NavNode[] = []): NavNode[] {
  for (const n of nodes) {
    acc.push(n);
    if (n.children?.length) flatten(n.children, acc);
  }
  return acc;
}

export function Sidebar({
  nav,
  currentSlug,
  onNavigate,
  productId = "ctix",
}: {
  nav: NavNode[];
  currentSlug: string;
  onNavigate: () => void;
  productId?: string;
}) {
  const [filter, setFilter] = useState("");
  const endpointFilterId = useId();
  const flat = useMemo(() => flatten(nav), [nav]);
  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return null;
    return flat.filter((n) => n.title.toLowerCase().includes(q)).slice(0, 80);
  }, [filter, flat]);

  return (
    <nav aria-label="API documentation" className="flex h-full flex-col">
      <div className="p-3">
        <label htmlFor={endpointFilterId} className="sr-only">
          Filter endpoints
        </label>
        <input
          id={endpointFilterId}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter endpoints…"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--atlas-signal)] focus:shadow-[var(--shadow-focused)]"
        />
      </div>
      <div data-top-chrome-scroll className="scroll-thin flex-1 overflow-y-auto px-2 pb-6">
        {matches ? (
          matches.length === 0 ? (
            <p className="px-2 py-4 text-sm text-[var(--text-muted)]">No matches.</p>
          ) : (
            matches.map((n) => (
              <Link
                key={n.slug}
                href={`/docs/${productId}/${n.slug}`}
                onClick={onNavigate}
                className={`block truncate rounded-[var(--radius-sm)] px-2 py-1 text-[13px] hover:bg-[var(--surface-muted)] ${
                  n.slug === currentSlug
                    ? "bg-[color-mix(in_srgb,var(--atlas-signal)_12%,var(--surface-muted))] font-semibold text-[var(--text-heading)] shadow-[inset_2px_0_0_var(--atlas-signal)]"
                    : "text-[var(--text-secondary)]"
                }`}
                title={n.title}
              >
                <MethodTag method={n.method} />
                {n.title}
              </Link>
            ))
          )
        ) : (
          nav.map((node) => (
            <NavItem
              key={node.slug}
              node={node}
              currentSlug={currentSlug}
              depth={0}
              onNavigate={onNavigate}
              productId={productId}
            />
          ))
        )}
      </div>
    </nav>
  );
}
