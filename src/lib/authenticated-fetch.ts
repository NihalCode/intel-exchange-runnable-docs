/**
 * Browser fetch wrapper for authenticated same-origin APIs.
 *
 * Auth0 rolling sessions can return 401 SESSION_EXPIRED while also emitting a
 * refreshed Set-Cookie. This helper waits for cookies to commit, probes
 * GET /api/auth/me, and retries the original request exactly once when recovery
 * succeeds. Concurrent callers share one recovery promise.
 */

export const SESSION_RECOVERY_IN_PROGRESS_MESSAGE =
  "Refreshing your secure session…";

export const SESSION_RECOVERY_FAILED_MESSAGE =
  "Your sign-in session could not be restored. Redirecting to sign in…";

export type SessionRecoveryState = "idle" | "recovering" | "failed";

export type AuthenticatedFetchOptions = RequestInit & {
  /** Notify UI while session recovery runs. */
  onRecoveryStateChange?: (state: SessionRecoveryState) => void;
  /**
   * Rebuild init before the single retry (e.g. refresh CSRF after recovery).
   * Called only after a successful session probe.
   */
  prepareRetry?: (init: RequestInit) => RequestInit | Promise<RequestInit>;
  /** When true (default), redirect once to sign-in after failed recovery. */
  redirectOnFailure?: boolean;
  /**
   * Treat bare 401 (no SESSION_EXPIRED code) as recoverable for known auth APIs.
   * Defaults to true for `/api/users` paths.
   */
  treatBare401AsSessionExpired?: boolean;
};

const SESSION_COOKIE_SETTLE_MS = 150;
const AUTH_ME_PATH = "/api/auth/me";

let sharedRecovery: Promise<boolean> | null = null;
let redirectScheduled = false;

/** Test helper — reset module singletons between cases. */
export function resetAuthenticatedFetchStateForTests(): void {
  sharedRecovery = null;
  redirectScheduled = false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function apiPathname(url: string): string {
  try {
    return url.startsWith("http") ? new URL(url).pathname : url.split("?")[0] ?? url;
  } catch {
    return url;
  }
}

function isUsersApiPath(url: string): boolean {
  const path = apiPathname(url);
  return path === "/api/users" || path.startsWith("/api/users/");
}

/** Auth-sensitive APIs where a bare 401 often means a rolling Auth0 cookie settle. */
function isSessionRecoveryApiPath(url: string): boolean {
  const path = apiPathname(url);
  if (isUsersApiPath(url)) return true;
  if (path === "/api/auth/csrf") return true;
  if (path === "/api/authentication/credentials") return true;
  if (path.startsWith("/api/authentication/credentials/")) return true;
  if (path === "/api/agent/feedback" || path.startsWith("/api/agent/feedback/")) {
    return true;
  }
  return false;
}

function defaultTreatBare401(url: string, explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  return isSessionRecoveryApiPath(url);
}

/** Bodies we can safely send again after SESSION_EXPIRED (mutation never started). */
export function isReplayableRequestBody(body: BodyInit | null | undefined): boolean {
  if (body == null) return true;
  if (typeof body === "string") return true;
  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) return true;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(body)) return true;
  if (typeof Blob !== "undefined" && body instanceof Blob) return true;
  // FormData may already be consumed; do not auto-retry mutations with it.
  if (typeof FormData !== "undefined" && body instanceof FormData) return false;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return true;
  return false;
}

type SessionExpiredPreview = {
  code?: unknown;
  signIn?: unknown;
  error?: unknown;
};

export function isSessionExpiredPayload(
  status: number,
  payload: SessionExpiredPreview | null,
  treatBare401: boolean
): boolean {
  if (status !== 401) return false;
  if (payload && payload.code === "SESSION_EXPIRED") return true;
  if (treatBare401 && (!payload || payload.code == null || payload.code === "")) {
    return true;
  }
  return false;
}

async function readSessionExpiredPreview(
  response: Response
): Promise<SessionExpiredPreview | null> {
  try {
    const data = (await response.clone().json()) as SessionExpiredPreview;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function signInUrlFromPreview(
  preview: SessionExpiredPreview | null,
  returnPath: string
): string {
  if (typeof preview?.signIn === "string" && preview.signIn.startsWith("/")) {
    return preview.signIn;
  }
  return `/sign-in?returnTo=${encodeURIComponent(returnPath || "/")}`;
}

function currentReturnPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

function redirectToSignInOnce(signIn: string): void {
  if (typeof window === "undefined" || redirectScheduled) return;
  redirectScheduled = true;
  window.location.assign(signIn);
}

async function probeAuthenticatedSession(): Promise<boolean> {
  try {
    const res = await fetch(AUTH_ME_PATH, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { authenticated?: boolean };
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}

/**
 * Shared recovery: settle Set-Cookie, then probe /api/auth/me.
 * Concurrent callers await the same promise.
 */
export async function recoverAuthenticatedSession(): Promise<boolean> {
  if (!sharedRecovery) {
    sharedRecovery = (async () => {
      await delay(SESSION_COOKIE_SETTLE_MS);
      return probeAuthenticatedSession();
    })().finally(() => {
      sharedRecovery = null;
    });
  }
  return sharedRecovery;
}

function withAuthDefaults(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: init?.credentials ?? "include",
    cache: init?.cache ?? "no-store",
  };
}

/**
 * Fetch with credentials and a single SESSION_EXPIRED recovery retry.
 * Does not retry 403/409/429/5xx, network failures, or non-replayable bodies.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  options?: AuthenticatedFetchOptions
): Promise<Response> {
  const {
    onRecoveryStateChange,
    prepareRetry,
    redirectOnFailure = true,
    treatBare401AsSessionExpired,
    ...init
  } = options ?? {};

  const url = requestUrl(input);
  const treatBare401 = defaultTreatBare401(url, treatBare401AsSessionExpired);
  const firstInit = withAuthDefaults(init);

  const first = await fetch(input, firstInit);

  if (first.status !== 401) {
    return first;
  }

  const preview = await readSessionExpiredPreview(first);
  if (!isSessionExpiredPayload(first.status, preview, treatBare401)) {
    return first;
  }

  if (!isReplayableRequestBody(firstInit.body ?? null)) {
    return first;
  }

  onRecoveryStateChange?.("recovering");
  const recovered = await recoverAuthenticatedSession();

  if (!recovered) {
    onRecoveryStateChange?.("failed");
    if (redirectOnFailure) {
      redirectToSignInOnce(signInUrlFromPreview(preview, currentReturnPath()));
    }
    // Stay on "failed" so UI can show restore copy until navigation completes.
    return first;
  }

  let retryInit = withAuthDefaults(init);
  if (prepareRetry) {
    retryInit = withAuthDefaults(await prepareRetry(retryInit));
  }

  const second = await fetch(input, retryInit);
  onRecoveryStateChange?.("idle");
  return second;
}
