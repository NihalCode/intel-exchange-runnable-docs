"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { inputClass, buttonPrimaryClass } from "@/components/admin/ui/tokens";
import { useProduct } from "@/components/ProductContext";
import { docsSearchResultHref } from "@/lib/docs-search-href";

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

/**
 * Real documentation search against POST /api/docs/search.
 * Respects ProductContext search scope when `respectProductScope` is true.
 */
export function DocsSearch({
  productId: productIdProp,
  respectProductScope = true,
  className = "",
  placeholder = "Search endpoints, guides, and concepts",
  size = "default",
}: {
  productId?: string;
  respectProductScope?: boolean;
  className?: string;
  placeholder?: string;
  /** Hub = large techdocs-style field; compact = header search. */
  size?: "default" | "hub" | "compact";
}) {
  const router = useRouter();
  const { productId: ctxProductId, searchScope } = useProduct();
  const scopedProductId =
    productIdProp ?? (respectProductScope && searchScope === "product" ? ctxProductId : undefined);

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
            productId: scopedProductId || undefined,
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
    [scopedProductId]
  );

  useEffect(() => {
    const t = window.setTimeout(() => void runSearch(query), 280);
    return () => window.clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const navigateToResult = useCallback(
    (hit: DocsSearchHit) => {
      const href = docsSearchResultHref(hit);
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  return (
    <div
      ref={wrapRef}
      className={`relative ${size === "hub" ? "cx-search-hub" : ""} ${className}`}
      data-testid="docs-search"
      data-layout={size === "hub" ? "cx-search-hub" : size === "compact" ? "cx-search-compact" : "cx-search"}
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0]) {
            navigateToResult(results[0]);
            return;
          }
          void runSearch(query);
        }}
        className={`flex gap-2 ${size === "hub" ? "max-w-3xl" : size === "compact" ? "max-w-none" : "max-w-2xl"}`}
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
          className={`${inputClass} min-w-0 flex-1 ${
            size === "hub" ? "py-3.5 text-base" : size === "compact" ? "py-1.5 text-xs" : "py-3"
          }`}
          autoComplete="off"
        />
        {size !== "compact" ? (
          <button
            type="submit"
            className={`${buttonPrimaryClass} ${size === "hub" ? "px-6 py-3.5" : "px-5 py-3"}`}
          >
            {loading ? "…" : "Search"}
          </button>
        ) : (
          <button type="submit" className="sr-only">
            Search
          </button>
        )}
      </form>

      {open ? (
        <div
          id={listId}
          role="listbox"
          data-layout="cx-search-overlay"
          className={`absolute z-30 mt-2 overflow-hidden border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[var(--shadow-overlay)] ${
            size === "compact" ? "w-full min-w-[18rem] right-0" : "w-full max-w-3xl"
          }`}
          style={{ borderRadius: "var(--radius-md)" }}
        >
          {error ? (
            <p className="px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">
              {error}
            </p>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[var(--text-secondary)]">
              <p>{loading ? "Searching…" : "No matching documentation."}</p>
              {!loading ? (
                <p className="mt-2">
                  <a href="/agent" className="font-medium text-[var(--accent-ai)] hover:underline">
                    Ask AI instead →
                  </a>
                </p>
              ) : null}
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto scroll-thin py-1">
              {results.map((hit, i) => (
                <li key={hit.id || `${docsSearchResultHref(hit)}-${i}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="block w-full px-4 py-2.5 text-left hover:bg-[var(--surface-muted)]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => navigateToResult(hit)}
                  >
                    <span className="block text-sm font-medium text-[var(--text-heading)]">
                      {hit.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      {hit.productId ? (
                        <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 uppercase tracking-wide">
                          {hit.productId}
                        </span>
                      ) : null}
                      {hit.excerpt || hit.snippet ? (
                        <span className="line-clamp-1">{hit.excerpt || hit.snippet}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
              <li className="border-t border-[var(--border-subtle)] px-4 py-2">
                <a
                  href="/agent"
                  className="text-xs font-medium text-[var(--accent-ai)] hover:underline"
                >
                  Escalate to Ask AI →
                </a>
              </li>
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
