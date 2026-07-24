import { passwordLoginPath } from "@/lib/documentation-auth/password-connection";
import {
  auth0LogoutToOriginPath,
  mfaStepUpCookieOptions,
  normalizeLogoutOrigin,
} from "@/lib/enterprise/mfa-step-up";

/** Short-lived cookie: `login|/returnTo` or `signup|/returnTo`. */
export const FRESH_LOGIN_COOKIE = "cyware_fresh_login";

/** App entry that clears Auth0 session then starts email/password login. */
export const FRESH_LOGIN_START_PATH = "/access/fresh-login";

const FRESH_LOGIN_COOKIE_MAX_AGE_SEC = 180;

export function freshLoginCookieOptions(secure: boolean) {
  return {
    ...mfaStepUpCookieOptions(secure),
    maxAge: FRESH_LOGIN_COOKIE_MAX_AGE_SEC,
  };
}

export function encodeFreshLoginCookie(
  mode: "login" | "signup",
  returnTo = "/"
): string {
  const path = sanitizeFreshLoginReturnTo(returnTo);
  return `${mode}|${path}`;
}

/** Allowlisted app-relative return paths only (no open redirects / auth loops). */
export function sanitizeFreshLoginReturnTo(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "/";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("://") ||
    decoded.includes("\\")
  ) {
    return "/";
  }
  if (
    decoded.startsWith("/access/fresh-login") ||
    decoded.startsWith("/auth/") ||
    decoded.startsWith("/sign-in") ||
    decoded.startsWith("/sign-up")
  ) {
    return "/";
  }
  return decoded;
}

export function parseFreshLoginCookie(
  raw: string | undefined
): { mode: "login" | "signup"; returnTo: string } | null {
  if (!raw) return null;
  const sep = raw.indexOf("|");
  const mode = (sep === -1 ? raw : raw.slice(0, sep)).trim();
  const returnToRaw = sep === -1 ? "/" : raw.slice(sep + 1).trim() || "/";
  if (mode !== "login" && mode !== "signup") return null;
  return { mode, returnTo: sanitizeFreshLoginReturnTo(returnToRaw) };
}

/** Branded Sign in / Sign up → clear sticky session safely, then password UL. */
export function freshLoginStartHref(
  mode: "login" | "signup",
  returnTo?: string
): string {
  const params = new URLSearchParams({ mode });
  if (returnTo) params.set("returnTo", returnTo);
  return `${FRESH_LOGIN_START_PATH}?${params.toString()}`;
}

export function freshPasswordLoginPath(cookieValue: string): string {
  const parsed = parseFreshLoginCookie(cookieValue);
  if (!parsed) {
    return passwordLoginPath({ forceLogin: true });
  }
  return passwordLoginPath({
    returnTo: parsed.returnTo,
    forceLogin: true,
    signUp: parsed.mode === "signup",
  });
}

export { auth0LogoutToOriginPath, normalizeLogoutOrigin };
