"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import type { DocumentationPermission, DocumentationRole } from "@/lib/documentation-auth/types";
import { hasPermission } from "@/lib/documentation-auth/permissions";

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: DocumentationRole;
  status: string;
  picture?: string | null;
}

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  auth0Authenticated: boolean;
  user: AuthUser | null;
  permissions: DocumentationPermission[];
  accessDenied: { reason: string; invitedEmail?: string; redirectTo?: string } | null;
}

const AuthContext = createContext<{
  state: AuthState;
  hasPermission: (permission: DocumentationPermission) => boolean;
  refresh: () => Promise<void>;
} | null>(null);

const PUBLIC_PREFIXES = ["/auth", "/access", "/invite", "/sign-in", "/post-login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function DocumentationAuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    loading: true,
    authenticated: false,
    auth0Authenticated: false,
    user: null,
    permissions: [],
    accessDenied: null,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = (await res.json()) as {
        authenticated?: boolean;
        auth0Authenticated?: boolean;
        user?: AuthUser | null;
        permissions?: DocumentationPermission[];
        accessDenied?: AuthState["accessDenied"];
      };
      setState({
        loading: false,
        authenticated: Boolean(data.authenticated),
        auth0Authenticated: Boolean(data.auth0Authenticated),
        user: data.user ?? null,
        permissions: data.permissions ?? [],
        accessDenied: data.accessDenied ?? null,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (state.loading || isPublicPath(pathname)) return;

    if (state.accessDenied?.redirectTo) {
      router.replace(state.accessDenied.redirectTo);
      return;
    }

    if (!state.authenticated && state.auth0Authenticated) {
      router.replace("/access/invite-required");
    }
  }, [state, pathname, router]);

  const checkPermission = useCallback(
    (permission: DocumentationPermission) => {
      if (!state.user) return false;
      return hasPermission(state.user.role, permission);
    },
    [state.user]
  );

  const value = useMemo(
    () => ({ state, hasPermission: checkPermission, refresh }),
    [state, checkPermission, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useDocumentationAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useDocumentationAuth must be used within DocumentationAuthProvider");
  }
  return ctx;
}
