"use client";

import { usePathname } from "next/navigation";

import type { NavNode } from "@/lib/types";
import { AppShell } from "@/components/AppShell";

const BARE_LAYOUT_PREFIXES = ["/sign-in", "/access", "/invite", "/post-login", "/auth"];

function usesBareLayout(pathname: string): boolean {
  return BARE_LAYOUT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function usesAdminLayout(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function ConditionalAppShell({
  nav,
  children,
}: {
  nav: NavNode[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (usesBareLayout(pathname)) {
    return <>{children}</>;
  }
  if (usesAdminLayout(pathname)) {
    return <>{children}</>;
  }
  return <AppShell nav={nav}>{children}</AppShell>;
}
