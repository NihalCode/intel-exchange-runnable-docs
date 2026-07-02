import "server-only";

import { isAuthEnvComplete } from "@/lib/documentation-auth/env";

export function isAuthDisabled(): boolean {
  return process.env.AUTH_DISABLED === "true";
}

export function isAuthEnabled(): boolean {
  if (isAuthDisabled()) return false;
  return isAuthEnvComplete();
}

export function isTestAuthMode(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}
