import "server-only";

/**
 * Trusted client IP for analytics / unanswered capture.
 * Prefer Vercel's edge-set header; then last hop of x-forwarded-for
 * (client-spoofed first hops are untrusted on Vercel); then x-real-ip.
 */
export function resolveTrustedClientIp(headers: Headers): string | null {
  const vercel = headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) {
    const candidate = pickIpCandidate(vercel);
    if (candidate) return candidate;
  }

  const forwarded = headers.get("x-forwarded-for")?.trim();
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    // On Vercel, the rightmost hop is appended by the platform.
    for (let i = hops.length - 1; i >= 0; i -= 1) {
      const candidate = pickIpCandidate(hops[i]!);
      if (candidate) return candidate;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    const candidate = pickIpCandidate(realIp);
    if (candidate) return candidate;
  }

  return null;
}

function pickIpCandidate(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  // Strip surrounding brackets for IPv6 literals like [::1]
  if (value.startsWith("[") && value.includes("]")) {
    value = value.slice(1, value.indexOf("]"));
  }

  // Strip :port for IPv4 host:port (not for bare IPv6)
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.replace(/:\d+$/, "");
  }

  if (!isPlausibleIp(value)) return null;
  return value.slice(0, 64);
}

function isPlausibleIp(value: string): boolean {
  if (value.length < 3 || value.length > 64) return false;
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value.split(".").every((octet) => {
      const n = Number(octet);
      return n >= 0 && n <= 255;
    });
  }
  // IPv6 (loose)
  if (value.includes(":")) {
    return /^[0-9a-fA-F:]+$/.test(value) && value.split(":").length >= 2;
  }
  return false;
}
