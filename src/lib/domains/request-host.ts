import type { NextRequest } from "next/server";

/** Trusted proxy model: prefer platform `x-forwarded-host` on Vercel. */
export function trustedRequestHostname(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.split(":")[0]!;
  }
  const host = request.headers.get("host")?.trim();
  if (host) return host.split(":")[0]!;
  return "localhost";
}

export function trustedHostnameFromHeaders(
  headerStore: Headers
): string {
  const forwarded = headerStore.get("x-forwarded-host");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.split(":")[0]!;
  }
  const host = headerStore.get("host")?.trim();
  if (host) return host.split(":")[0]!;
  return "localhost";
}
