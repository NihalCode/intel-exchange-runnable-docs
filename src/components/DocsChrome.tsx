"use client";

import Link from "next/link";

export function DocsBreadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-xs text-[var(--text-muted)]" data-testid="docs-breadcrumbs">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href && i < items.length - 1 ? (
              <Link href={item.href} className="hover:text-[var(--text-link)]">
                {item.label}
              </Link>
            ) : (
              <span className="text-[var(--text-secondary)]">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DocsToc({
  headings,
}: {
  headings: Array<{ id: string; text: string; level: number }>;
}) {
  if (headings.length < 2) return null;
  return (
    <nav
      aria-label="On this page"
      className="mb-6 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3"
      data-testid="docs-toc"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        On this page
      </p>
      <ul className="mt-2 space-y-1">
        {headings.map((h) => (
          <li key={h.id} style={{ paddingLeft: Math.max(0, h.level - 2) * 12 }}>
            <a
              href={`#${h.id}`}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-link)]"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DocsPrevNext({
  prev,
  next,
}: {
  prev?: { href: string; title: string } | null;
  next?: { href: string; title: string } | null;
}) {
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="Adjacent pages"
      className="mt-10 grid gap-3 border-t border-[var(--border-subtle)] pt-6 sm:grid-cols-2"
      data-testid="docs-prev-next"
    >
      {prev ? (
        <Link
          href={prev.href}
          className="rounded-[var(--radius-lg)] border border-[var(--border-default)] p-3 hover:border-[var(--accent-primary)] hover:bg-[var(--surface-muted)]"
        >
          <span className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            Previous
          </span>
          <span className="mt-1 block text-sm font-medium text-[var(--text-heading)]">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="rounded-[var(--radius-lg)] border border-[var(--border-default)] p-3 text-right hover:border-[var(--accent-primary)] hover:bg-[var(--surface-muted)] sm:justify-self-end"
        >
          <span className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            Next
          </span>
          <span className="mt-1 block text-sm font-medium text-[var(--text-heading)]">
            {next.title}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}

/** Extract ## / ### headings from markdown for a lightweight TOC. */
export function extractMarkdownHeadings(
  markdown: string
): Array<{ id: string; text: string; level: number }> {
  const out: Array<{ id: string; text: string; level: number }> = [];
  for (const line of markdown.split("\n")) {
    const m = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    const text = m[2].replace(/[#*`[\]]/g, "").trim();
    if (!text) continue;
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    out.push({ id, text, level: m[1].length });
  }
  return out;
}
