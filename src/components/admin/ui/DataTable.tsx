"use client";

import { useMemo, useState } from "react";

import { EmptyState, LoadingSkeleton } from "@/components/admin/ui/EmptyState";
import { inputClass, tableClass } from "@/components/admin/ui/tokens";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  caption: string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  caption,
  loading,
  error,
  emptyTitle = "No records",
  emptyDescription,
  pageSize = 10,
  searchable,
  searchPlaceholder = "Search…",
  searchFilter,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let rows = data;
    if (searchable && query.trim() && searchFilter) {
      rows = rows.filter((row) => searchFilter(row, query.trim().toLowerCase()));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        rows = [...rows].sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return rows;
  }, [columns, data, query, searchable, searchFilter, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  if (loading) return <LoadingSkeleton rows={6} />;
  if (error) {
    return (
      <p className="rounded-md border border-red-200 px-4 py-6 text-sm text-red-800 dark:border-red-900 dark:text-red-300" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div>
      {searchable ? (
        <div className="mb-3">
          <input
            type="search"
            className={`${inputClass} max-w-xs`}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            aria-label="Search table"
          />
        </div>
      ) : null}

      {!pageRows.length ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className={tableClass}>
              <caption className="sr-only">{caption}</caption>
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
                <tr className="border-b border-zinc-300 dark:border-zinc-700">
                  {columns.map((col) => (
                    <th key={col.key} scope="col" className="p-2 font-medium">
                      {col.sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-sky-700 dark:hover:text-sky-300"
                          onClick={() => toggleSort(col.key)}
                        >
                          {col.header}
                          {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : null}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className="border-b border-zinc-200 dark:border-zinc-800"
                  >
                    {columns.map((col) => (
                      <td key={col.key} className="p-2">
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-zinc-500">
                {filtered.length} record{filtered.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-50 dark:border-zinc-700"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-50 dark:border-zinc-700"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
