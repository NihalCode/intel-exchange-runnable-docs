import Link from "next/link";
import type { ReactNode } from "react";

/** Shared presentation primitives for the structural Cyware replica (not token-only wrappers). */

export function CxPage({
  children,
  className = "",
  layout = "default",
}: {
  children: ReactNode;
  className?: string;
  layout?: "default" | "hub" | "narrow" | "wide" | "flush";
}) {
  const width =
    layout === "hub"
      ? "max-w-[var(--hub-max)]"
      : layout === "narrow"
        ? "max-w-[var(--article-max)]"
        : layout === "wide"
          ? "max-w-[var(--workbench-max)]"
          : layout === "flush"
            ? "max-w-none"
            : "max-w-[var(--content-max)]";
  return (
    <div
      data-layout={`cx-page-${layout}`}
      className={`mx-auto w-full ${width} ${className}`}
    >
      {children}
    </div>
  );
}

export function CxSection({
  children,
  className = "",
  eyebrow,
  title,
  description,
  actions,
  id,
}: {
  children?: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      data-layout="cx-section"
      className={`py-[var(--section-gap)] ${className}`}
    >
      {(eyebrow || title || description || actions) && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent-primary)]">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-heading)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function CxProductCard({
  href,
  title,
  description,
  badge,
  meta,
  footer,
  accentClass,
  initial,
}: {
  href: string;
  title: string;
  description: string;
  badge?: ReactNode;
  meta?: ReactNode;
  footer?: string;
  accentClass?: string;
  /** Prefer a product-distinct mark (e.g. CT, CS, OR, CF) over title[0]. */
  initial?: string;
}) {
  const mark = (initial?.trim() || title.trim().slice(0, 2) || "?").slice(0, 2).toUpperCase();
  return (
    <Link
      href={href}
      data-layout="cx-product-card"
      className={`sf-product-module group flex h-full flex-col p-5 ${accentClass ?? ""}`}
    >
      <div
        data-layout="cx-product-card-mark-row"
        className="flex min-h-10 items-center gap-3"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center text-xs font-bold tracking-wide text-white"
          style={{
            background: "var(--product-accent, var(--accent-primary))",
            borderRadius: "var(--radius-md)",
          }}
          aria-hidden="true"
        >
          {mark}
        </span>
        {badge ? (
          <div className="min-w-0 flex-1 overflow-hidden">{badge}</div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        {meta ? <div className="shrink-0 whitespace-nowrap">{meta}</div> : null}
      </div>
      <h3 className="mt-4 min-h-[2.75rem] text-base font-semibold leading-snug text-[var(--text-heading)] group-hover:text-[var(--text-link)] line-clamp-2">
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-[var(--text-secondary)] line-clamp-3">
        {description}
      </p>
      {footer ? (
        <p className="mt-4 text-sm font-medium text-[var(--text-link)]">{footer}</p>
      ) : null}
    </Link>
  );
}

export function CxFooter() {
  return (
    <footer
      data-layout="cx-footer"
      className="mt-auto border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)]"
    >
      <div className="mx-auto grid max-w-[var(--hub-max)] gap-8 px-4 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-heading)]">Cyware Documentation</p>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
            API references, guides, and runnable examples for Cyware products.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Explore
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            <li>
              <Link href="/" className="hover:text-[var(--text-link)]">
                Product hub
              </Link>
            </li>
            <li>
              <Link href="/guides" className="hover:text-[var(--text-link)]">
                Guides
              </Link>
            </li>
            <li>
              <Link href="/changelog" className="hover:text-[var(--text-link)]">
                Changelog
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Workspace
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            <li>
              <Link href="/agent" className="hover:text-[var(--text-link)]">
                Ask AI
              </Link>
            </li>
            <li>
              <Link href="/authentication" className="hover:text-[var(--text-link)]">
                Authentication
              </Link>
            </li>
            <li>
              <Link href="/settings/users" className="hover:text-[var(--text-link)]">
                Settings
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Products
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            <li>
              <Link href="/docs/ctix" className="hover:text-[var(--text-link)]">
                Intel Exchange
              </Link>
            </li>
            <li>
              <Link href="/docs/cftr" className="hover:text-[var(--text-link)]">
                Respond
              </Link>
            </li>
            <li>
              <Link href="/docs/csap" className="hover:text-[var(--text-link)]">
                Collaborate
              </Link>
            </li>
            <li>
              <Link href="/docs/orchestrate" className="hover:text-[var(--text-link)]">
                Orchestrate
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export function CxRail({
  children,
  side,
  className = "",
  label,
}: {
  children: ReactNode;
  side: "left" | "right";
  className?: string;
  label?: string;
}) {
  return (
    <aside
      data-layout={`cx-rail-${side}`}
      aria-label={label}
      className={`scroll-thin overflow-y-auto ${className}`}
    >
      {children}
    </aside>
  );
}

export function CxWorkbench({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-layout="cx-workbench"
      className={`flex min-h-0 flex-1 flex-col gap-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function CxToolbar({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-layout="cx-toolbar"
      className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border-subtle)] pb-4"
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-[var(--text-heading)]">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
