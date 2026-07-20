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
export function AdminAppExitNav({ variant = "header" }: { variant?: "header" | "sidebar" }) {
  const pathname = usePathname();

  if (variant === "sidebar") {
    return (
      <div className="space-y-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-950/50"
        >
          <ArrowLeftIcon />
          Back to app
        </Link>
        <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
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
                  className={`block rounded-md px-2 py-1.5 text-sm ${
                    active
                      ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
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
        className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-100 dark:hover:bg-sky-950"
      >
        <ArrowLeftIcon />
        Back to app
      </Link>
      <span className="hidden h-4 w-px bg-zinc-300 sm:inline dark:bg-zinc-700" aria-hidden="true" />
      <nav aria-label="Workspace" className="hidden items-center gap-0.5 sm:flex">
        {APP_LINKS.map((link) => {
          const active = link.match(pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                active
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
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
