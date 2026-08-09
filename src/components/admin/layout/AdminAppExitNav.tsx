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
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
        className={`space-y-1.5 border-b px-2.5 py-2.5 ${
          inverse ? "border-white/10" : "border-[var(--atlas-line)]"
        }`}
        data-tone={tone}
      >
        <Link
          href="/"
          className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] font-medium ${
            inverse
              ? "text-white hover:bg-white/10"
              : "text-[var(--atlas-signal)] hover:bg-[var(--surface-muted)]"
          }`}
        >
          <ArrowLeftIcon />
          Back to app
        </Link>
        <p
          className={`atlas-micro-label px-2 ${
            inverse ? "text-white/65" : "text-[var(--atlas-text-muted)]"
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
                  className={`block rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] ${
                    inverse
                      ? active
                        ? "bg-white/15 font-medium text-white"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                      : active
                        ? "bg-[var(--surface-muted)] font-medium text-[var(--atlas-text)]"
                        : "text-[var(--atlas-text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--atlas-text)]"
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
    <div className="flex flex-wrap items-center gap-1">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--atlas-signal)] hover:border-[var(--atlas-line-strong)]"
      >
        <ArrowLeftIcon />
        Back to app
      </Link>
      <span
        className="hidden h-3.5 w-px bg-[var(--atlas-line)] sm:inline"
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
              className={`rounded-[var(--radius-sm)] px-1.5 py-1 text-[11px] font-medium ${
                active
                  ? "bg-[var(--surface-muted)] text-[var(--atlas-text)]"
                  : "text-[var(--atlas-text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--atlas-text)]"
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
