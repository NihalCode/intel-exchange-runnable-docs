"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { EnterprisePermission } from "@/lib/enterprise/types";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  permission: EnterprisePermission;
  match: (pathname: string) => boolean;
}> = [
  {
    href: "/admin/documentation-agent/apis",
    label: "APIs",
    permission: "admin_dashboard.access",
    match: (pathname) => pathname.startsWith("/admin/documentation-agent/apis"),
  },
  {
    href: "/admin/documentation-agent/security",
    label: "Security",
    permission: "security_settings.manage",
    match: (pathname) =>
      pathname.startsWith("/admin/documentation-agent/security"),
  },
  {
    href: "/admin/documentation-agent/jobs",
    label: "Jobs",
    permission: "jobs.read",
    match: (pathname) => pathname.startsWith("/admin/documentation-agent/jobs"),
  },
];

const linkClass =
  "rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600";
const activeClass =
  "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100";
const inactiveClass =
  "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900";

export function AdminSubNav({
  capabilities,
}: {
  capabilities: EnterprisePermission[];
}) {
  const pathname = usePathname();
  const allowed = new Set(capabilities);
  const items = NAV_ITEMS.filter((item) => allowed.has(item.permission));
  if (items.length <= 1) return null;

  return (
    <nav
      aria-label="Documentation Agent administration"
      className="mb-8 flex flex-wrap gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800"
    >
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${linkClass} ${active ? activeClass : inactiveClass}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
