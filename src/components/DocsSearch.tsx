"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { buttonPrimaryClass } from "@/components/admin/ui/tokens";
import { useProduct } from "@/components/ProductContext";
import { docsSearchResultHref } from "@/lib/docs-search-href";
import { useOptionalTopChrome } from "@/components/navigation/TopChromeProvider";

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
 * Results render in a portaled floating panel so hero `overflow: hidden` cannot clip them.
 */
export function DocsSearch({
  productId: productIdProp,
  respectProductScope = true,
  className = "",
  placeholder = "Search endpoints, guides, and concepts",
  size = "default",
  registerGlobalShortcutTarget = false,
}: {
  productId?: string;
  respectProductScope?: boolean;
  className?: string;
  placeholder?: string;
  /** Hub = large techdocs-style field; compact = header search. */
  size?: "default" | "hub" | "compact";
  /** When true, Ctrl/Cmd+K focuses this input via TopChromeProvider. */
  registerGlobalShortcutTarget?: boolean;
}) {
  const router = useRouter();
  const { productId: ctxProductId, searchScope } = useProduct();
  const topChrome = useOptionalTopChrome();
  const scopedProductId =
    productIdProp ?? (respectProductScope && searchScope === "product" ? ctxProductId : undefined);

  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocsSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const registerFocusSearch = topChrome?.registerFocusSearch;
  useEffect(() => {
    if (!registerGlobalShortcutTarget || !registerFocusSearch) return;
    registerFocusSearch(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => registerFocusSearch(null);
  }, [registerGlobalShortcutTarget, registerFocusSearch]);

  const updatePanelPosition = useCallback(() => {
    const anchor = wrapRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gutter = 8;
    const maxWidth = size === "compact" ? Math.max(rect.width, 288) : Math.min(rect.width, 768);
    const left = Math.min(
      Math.max(gutter, rect.left),
      window.innerWidth - maxWidth - gutter
    );
    const top = rect.bottom + gutter;
    const maxHeight = Math.max(180, Math.min(window.innerHeight - top - gutter, 420));
    setPanelStyle({
      position: "fixed",
      top,
      left,
      width: maxWidth,
      maxHeight,
      zIndex: 80,
    });
  }, [size]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    function onReposition() {
      updatePanelPosition();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updatePanelPosition, results.length, error, loading]);

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
        setActiveIndex(0);
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
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      const panel = document.getElementById(listId);
      if (panel?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [listId]);

  const navigateToResult = useCallback(
    (hit: DocsSearchHit) => {
      const href = docsSearchResultHref(hit);
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        topChrome?.unpin("search");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && results[activeIndex]) {
        e.preventDefault();
        navigateToResult(results[activeIndex]!);
      }
    },
    [activeIndex, navigateToResult, open, results, topChrome, listId]
  );

  const panel =
    open && mounted
      ? createPortal(
          <div
            id={listId}
            role="listbox"
            data-layout="cx-search-overlay"
            className="sf-search-panel"
            style={panelStyle}
          >
            <div className="sf-search-panel__glow" aria-hidden="true" />
            <div className="sf-search-panel__head">
              <span className="sf-search-panel__eyebrow">
                {loading ? "Scanning corpus…" : error ? "Search issue" : "Documentation hits"}
              </span>
              {!loading && !error ? (
                <span className="sf-search-panel__count">
                  {results.length} result{results.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <div className="sf-search-panel__body">
              {error ? (
                <p className="sf-search-panel__empty" role="alert">
                  {error}
                </p>
              ) : results.length === 0 ? (
                <div className="sf-search-panel__empty">
                  <p>{loading ? "Searching indexed endpoints and guides…" : "No matching documentation."}</p>
                  {!loading ? (
                    <a href="/agent" className="sf-search-panel__ask">
                      Ask AI instead →
                    </a>
                  ) : null}
                </div>
              ) : (
                <ul className="sf-search-panel__list">
                  {results.map((hit, i) => {
                    const active = i === activeIndex;
                    return (
                      <li key={hit.id || `${docsSearchResultHref(hit)}-${i}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          data-active={active}
                          className="sf-search-hit"
                          onMouseEnter={() => setActiveIndex(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => navigateToResult(hit)}
                        >
                          <span className="sf-search-hit__title">{hit.title}</span>
                          <span className="sf-search-hit__meta">
                            {hit.productId ? (
                              <span className="sf-search-hit__product">{hit.productId}</span>
                            ) : null}
                            {hit.excerpt || hit.snippet ? (
                              <span className="sf-search-hit__excerpt">
                                {hit.excerpt || hit.snippet}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="sf-search-panel__foot">
              <a href="/agent" className="sf-search-panel__ask">
                Escalate to Ask AI →
              </a>
              <span className="sf-search-panel__hint">↑↓ navigate · Enter open · Esc close</span>
            </div>
          </div>,
          document.body
        )
      : null;

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
          if (results[activeIndex]) {
            navigateToResult(results[activeIndex]!);
            return;
          }
          if (results[0]) {
            navigateToResult(results[0]);
            return;
          }
          void runSearch(query);
        }}
        className={`flex gap-2 ${size === "hub" ? "max-w-3xl" : size === "compact" ? "max-w-none" : "max-w-2xl"}`}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            topChrome?.pin("search");
            if (results.length || error) setOpen(true);
          }}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (wrapRef.current?.contains(next)) return;
            const panel = document.getElementById(listId);
            if (panel?.contains(next)) return;
            topChrome?.unpin("search");
          }}
          aria-label="Search documentation"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-expanded={open}
          placeholder={placeholder}
          className={`sf-search-input min-w-0 flex-1 ${
            size === "hub" ? "py-3.5 text-base" : size === "compact" ? "py-1.5 text-xs" : "py-3"
          }`}
          autoComplete="off"
        />
        {size !== "compact" ? (
          <button
            type="submit"
            className={`${buttonPrimaryClass} sf-search-submit ${size === "hub" ? "px-6 py-3.5" : "px-5 py-3"}`}
          >
            {loading ? "…" : "Search"}
          </button>
        ) : (
          <button type="submit" className="sr-only">
            Search
          </button>
        )}
      </form>
      {panel}
    </div>
  );
}
