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
      className="relative flex flex-wrap items-start justify-between gap-3 border-b border-[var(--atlas-line)] pb-4"
      data-layout="sf-operational-header"
    >
      <div
        className="pointer-events-none absolute left-0 top-1 h-7 w-0.5 rounded-[var(--radius-sm)] bg-[var(--atlas-signal)]"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 pl-3">
        {eyebrow ? <p className="atlas-micro-label text-[var(--atlas-signal)]">{eyebrow}</p> : null}
        <h1 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[var(--atlas-text)] sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm text-[var(--atlas-text-secondary)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

export function StatusMessage({ message }: { message: string }) {
  return (
    <p
      className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--atlas-text-secondary)]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {message}
    </p>
  );
}
