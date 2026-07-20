/** Browser helper: ensure X-CSRF-Token is present for same-origin mutating fetches. */

let cachedToken: string | null = null;

export async function getCsrfToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedToken) return cachedToken;
  try {
    const res = await fetch("/api/auth/csrf", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { csrfToken?: string };
    cachedToken = data.csrfToken ?? null;
    return cachedToken;
  } catch {
    return null;
  }
}

export async function withCsrfHeaders(
  init?: HeadersInit
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (init) {
    new Headers(init).forEach((value, key) => {
      headers[key] = value;
    });
  }
  const token = await getCsrfToken();
  if (token) headers["X-CSRF-Token"] = token;
  return headers;
}

export function clearCsrfTokenCache(): void {
  cachedToken = null;
}
