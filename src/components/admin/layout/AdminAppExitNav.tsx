"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const APP_LINKS = [
  { href: "/", label: "Documentation", match: (p: string) => p === "/" || p.startsWith("/docs/") },
  { href: "/agent", label: "Ask AI", match: (p: string) => p.startsWith("/agent") },
  {
    href: "/authentication",
    label: "Authentication",
    match: (p: string) => p.startsWith("/authentication"),
  },
] as const;

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Compact header control — primary exit + quick links. */
export function AdminAppExitNav({
  variant = "header",
  tone = "default",
}: {
  variant?: "header" | "sidebar";
  /** Use inverse on the dark admin nav rail so zinc/sky light-surface styles never win. */
  tone?: "default" | "inverse";
}) {
  const pathname = usePathname();
  const inverse = tone === "inverse";

  if (variant === "sidebar") {
    return (
      <div
        className={`space-y-2 border-b px-3 py-3 ${
          inverse ? "border-white/10" : "border-[var(--border-subtle)]"
        }`}
        data-tone={tone}
      >
        <Link
          href="/"
          className={`flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm font-medium ${
            inverse
              ? "text-white hover:bg-white/10"
              : "text-[var(--text-link)] hover:bg-[var(--surface-muted)]"
          }`}
        >
          <ArrowLeftIcon />
          Back to app
        </Link>
        <p
          className={`px-2 text-[10px] font-semibold uppercase tracking-wide ${
            inverse ? "text-white/65" : "text-[var(--text-muted)]"
          }`}
        >
          Workspace
        </p>
        <ul className="space-y-0.5">
          {APP_LINKS.map((link) => {
            const active = link.match(pathname);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-[var(--radius-md)] px-2 py-1.5 text-sm ${
                    inverse
                      ? active
                        ? "bg-white/15 font-medium text-white"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                      : active
                        ? "bg-[var(--surface-muted)] font-medium text-[var(--text-heading)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-link)] hover:bg-[var(--surface-raised)]"
      >
        <ArrowLeftIcon />
        Back to app
      </Link>
      <span
        className="hidden h-4 w-px bg-[var(--border-default)] sm:inline"
        aria-hidden="true"
      />
      <nav aria-label="Workspace" className="hidden items-center gap-0.5 sm:flex">
        {APP_LINKS.map((link) => {
          const active = link.match(pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-[var(--radius-md)] px-2 py-1 text-xs font-medium ${
                active
                  ? "bg-[var(--surface-muted)] text-[var(--text-heading)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
