"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { inputClass, buttonPrimaryClass } from "@/components/admin/ui/tokens";

export interface DocsSearchHit {
  id?: string;
  title: string;
  slug?: string;
  href?: string;
  productId?: string;
  excerpt?: string;
  snippet?: string;
  score?: number;
}

function resultHref(hit: DocsSearchHit): string {
  if (hit.href) return hit.href;
  const product = hit.productId || "ctix";
  const slug = (hit.slug || "").replace(/^\/+/, "");
  if (!slug) return `/docs/${product}`;
  // CTIX legacy routes may omit product prefix in [...slug]
  if (product === "ctix" && !slug.includes("/")) {
    return `/docs/${slug}`;
  }
  if (slug.startsWith(`${product}/`)) return `/docs/${slug}`;
  return `/docs/${product}/${slug}`;
}

/**
 * Real documentation search against POST /api/docs/search.
 * Replaces the previous home form that POSTed to /docs/ctix without searching.
 */
export function DocsSearch({
  productId,
  className = "",
  placeholder = "Search endpoints, guides, and concepts",
}: {
  productId?: string;
  className?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocsSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setOpen(false);
        setError(null);
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/docs/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            productId: productId || undefined,
            limit: 10,
          }),
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { results?: DocsSearchHit[] };
        setResults(data.results ?? []);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Search is temporarily unavailable");
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    },
    [productId]
  );

  useEffect(() => {
    const t = window.setTimeout(() => void runSearch(query), 280);
    return () => window.clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`} data-testid="docs-search">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query);
        }}
        className="flex max-w-2xl gap-2"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length || error) setOpen(true);
          }}
          aria-label="Search documentation"
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          className={`${inputClass} min-w-0 flex-1 py-3`}
          autoComplete="off"
        />
        <button type="submit" className={`${buttonPrimaryClass} px-5 py-3`}>
          {loading ? "…" : "Search"}
        </button>
      </form>

      {open ? (
        <div
          id={listId}
          className="absolute z-20 mt-2 w-full max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[var(--shadow-drawer)]"
        >
          {error ? (
            <p className="px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">
              {error}
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--text-secondary)]">
              {loading ? "Searching…" : "No matching documentation."}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto scroll-thin py-1">
              {results.map((hit, i) => {
                const href = resultHref(hit);
                return (
                  <li key={hit.id || `${href}-${i}`}>
                    <Link
                      href={href}
                      className="block px-4 py-2.5 hover:bg-[var(--surface-muted)]"
                      onClick={() => setOpen(false)}
                    >
                      <span className="block text-sm font-medium text-[var(--text-heading)]">
                        {hit.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        {hit.productId ? (
                          <span className="uppercase tracking-wide">{hit.productId}</span>
                        ) : null}
                        {hit.excerpt || hit.snippet ? (
                          <span className="line-clamp-1">{hit.excerpt || hit.snippet}</span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
