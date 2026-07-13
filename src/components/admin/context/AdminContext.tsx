"use client";

import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { EnterpriseEnvironment, EnterprisePermission } from "@/lib/enterprise/types";

export interface AdminContextValue {
  organization: { id: string; name: string; slug: string };
  user: { id: string; email: string; role: string };
  capabilities: EnterprisePermission[];
  csrfToken?: string;
  selectedEnvironment: EnterpriseEnvironment;
  setEnvironment: (env: EnterpriseEnvironment) => void;
  hasPermission: (permission: EnterprisePermission) => boolean;
}

const AdminContext = createContext<AdminContextValue | null>(null);

const ENVIRONMENTS: EnterpriseEnvironment[] = ["development", "staging", "production"];

function parseEnvironment(value: string | null): EnterpriseEnvironment {
  if (value === "staging" || value === "production") return value;
  return "development";
}

export function AdminProvider({
  organization,
  user,
  capabilities,
  csrfToken,
  children,
}: {
  organization: AdminContextValue["organization"];
  user: AdminContextValue["user"];
  capabilities: EnterprisePermission[];
  csrfToken?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const selectedEnvironment = parseEnvironment(searchParams.get("env"));

  const setEnvironment = useCallback(
    (env: EnterpriseEnvironment) => {
      const params = new URLSearchParams(searchParams.toString());
      if (env === "development") params.delete("env");
      else params.set("env", env);
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname);
      });
    },
    [pathname, router, searchParams]
  );

  const value = useMemo<AdminContextValue>(
    () => ({
      organization,
      user,
      capabilities,
      csrfToken,
      selectedEnvironment,
      setEnvironment,
      hasPermission: (permission) => capabilities.includes(permission),
    }),
    [organization, user, capabilities, csrfToken, selectedEnvironment, setEnvironment]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}

export function useEnvironmentFilter<T extends { environment?: string }>(items: T[]): T[] {
  const { selectedEnvironment } = useAdmin();
  return items.filter(
    (item) => !item.environment || item.environment === selectedEnvironment
  );
}

export { ENVIRONMENTS };
