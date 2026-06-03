"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { NavNode } from "@/lib/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-600 dark:text-emerald-400",
  POST: "text-sky-600 dark:text-sky-400",
  PUT: "text-amber-600 dark:text-amber-400",
  PATCH: "text-violet-600 dark:text-violet-400",
  DELETE: "text-red-600 dark:text-red-400",
};

function MethodTag({ method }: { method: string | null }) {
  if (!method) return null;
  return (
    <span className={`mr-1.5 font-mono text-[10px] font-bold ${METHOD_COLORS[method] || "text-zinc-500"}`}>
      {method}
    </span>
  );
}

function NavItem({
  node,
  currentSlug,
  depth,
  onNavigate,
}: {
  node: NavNode;
  currentSlug: string;
  depth: number;
  onNavigate: () => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isActive = node.slug === currentSlug;
  const containsActive =
    currentSlug === node.slug || currentSlug.startsWith(node.slug + "/");
  const [open, setOpen] = useState(containsActive);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded pr-1 ${
          isActive ? "bg-sky-100 dark:bg-sky-950/40" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
        }`}
        style={{ paddingLeft: `${depth * 10 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse" : "Expand"}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
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
          href={`/docs/${node.slug}`}
          onClick={onNavigate}
          className={`flex-1 truncate py-1 text-[13px] ${
            isActive ? "font-semibold text-sky-700 dark:text-sky-300" : "text-zinc-700 dark:text-zinc-300"
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
}: {
  nav: NavNode[];
  currentSlug: string;
  onNavigate: () => void;
}) {
  const [filter, setFilter] = useState("");
  const flat = useMemo(() => flatten(nav), [nav]);
  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return null;
    return flat.filter((n) => n.title.toLowerCase().includes(q)).slice(0, 80);
  }, [filter, flat]);

  return (
    <nav className="flex h-full flex-col">
      <div className="p-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter endpoints…"
          className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-6">
        {matches ? (
          matches.length === 0 ? (
            <p className="px-2 py-4 text-sm text-zinc-400">No matches.</p>
          ) : (
            matches.map((n) => (
              <Link
                key={n.slug}
                href={`/docs/${n.slug}`}
                onClick={onNavigate}
                className={`block truncate rounded px-2 py-1 text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800/60 ${
                  n.slug === currentSlug ? "bg-sky-100 font-semibold dark:bg-sky-950/40" : ""
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
            />
          ))
        )}
      </div>
    </nav>
  );
}
