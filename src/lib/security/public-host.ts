import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_PROTOCOLS = new Set([
  "file:",
  "ftp:",
  "gopher:",
  "javascript:",
  "data:",
  "mailto:",
]);

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
  return false;
}

export function assertAllowedProtocol(protocol: string): void {
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("Only http and https protocols are supported.");
  }
  if (BLOCKED_PROTOCOLS.has(protocol)) {
    throw new Error("Unsupported protocol.");
  }
}

/** Reject localhost, private ranges, link-local, and cloud metadata targets. */
export async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".local")
  ) {
    throw new Error("Requests to local/internal hosts are blocked.");
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Requests to private IPs are blocked.");
    return;
  }
  let records: { address: string }[] = [];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve host: ${hostname}`);
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error("Host resolves to a private IP and is blocked.");
    }
  }
}

export async function assertPublicUrl(url: URL): Promise<void> {
  assertAllowedProtocol(url.protocol);
  await assertPublicHost(url.hostname);
}

export interface SafeFetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
  maxRedirects?: number;
}

/** Fetch with manual redirect handling and per-hop host validation. */
export async function safeFetch(
  initialUrl: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  let current = new URL(initialUrl);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current.toString(), {
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body,
      signal: options.signal,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      if (hop === maxRedirects) {
        throw new Error("Too many redirects.");
      }
      current = new URL(location, current);
      continue;
    }
    return response;
  }
  throw new Error("Too many redirects.");
}
