"use client";

import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header
      className="relative flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-5"
      data-layout="sf-operational-header"
    >
      <div
        className="pointer-events-none absolute -left-1 top-1 h-8 w-1 rounded-full bg-[var(--product-accent,var(--accent-primary))]"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 pl-3">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent-primary)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-heading)] sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatusMessage({ message }: { message: string }) {
  return (
    <p
      className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {message}
    </p>
  );
}
