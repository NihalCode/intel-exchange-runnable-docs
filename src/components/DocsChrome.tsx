import Link from "next/link";

export function DocsBreadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 font-mono text-[11px] tracking-wide text-[var(--text-muted)]"
      data-testid="docs-breadcrumbs"
    >
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
  variant = "inline",
}: {
  headings: Array<{ id: string; text: string; level: number }>;
  /** `rail` = sticky right column (techdocs reader). */
  variant?: "inline" | "rail";
}) {
  if (headings.length < 2) return null;
  if (variant === "rail") {
    return (
      <nav
        aria-label="On this page"
        className="sticky top-[calc(var(--header-height)+var(--product-strip-height)+1.5rem)] hidden max-h-[calc(100vh-8rem)] overflow-y-auto scroll-thin border-l border-[var(--border-subtle)] pl-4 xl:block"
        data-testid="docs-toc"
        data-layout="cx-toc-rail"
      >
        <p className="atlas-micro-label">On this page</p>
        <ul className="mt-3 space-y-2">
          {headings.map((h) => (
            <li key={h.id} style={{ paddingLeft: Math.max(0, h.level - 2) * 10 }}>
              <a
                href={`#${h.id}`}
                className="text-xs leading-5 text-[var(--text-secondary)] hover:text-[var(--text-link)]"
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav
      aria-label="On this page"
      className="mb-6 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 xl:hidden"
      data-testid="docs-toc"
      data-layout="cx-toc-inline"
    >
      <p className="atlas-micro-label">On this page</p>
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
          className="rounded-[var(--radius-sm)] border border-[var(--border-default)] p-3 hover:border-[var(--atlas-signal)] hover:bg-[var(--surface-muted)]"
        >
          <span className="atlas-micro-label">Previous</span>
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
          className="rounded-[var(--radius-sm)] border border-[var(--border-default)] p-3 text-right hover:border-[var(--atlas-signal)] hover:bg-[var(--surface-muted)] sm:justify-self-end"
        >
          <span className="atlas-micro-label">Next</span>
          <span className="mt-1 block text-sm font-medium text-[var(--text-heading)]">
            {next.title}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
