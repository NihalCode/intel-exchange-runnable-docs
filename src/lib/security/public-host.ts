import dns from "node:dns/promises";
import net from "node:net";

export interface ResolvedAddress {
  address: string;
}

/**
 * Injectable boundary for DNS. Supplying this in tests avoids network-dependent
 * assertions; production uses Node's resolver below.
 */
export type HostResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

/** Injectable boundary for outbound requests. */
export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface PublicHostDependencies {
  resolve?: HostResolver;
}

export class PublicHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicHostError";
  }
}

const resolveWithNodeDns: HostResolver = async (hostname) =>
  dns.lookup(hostname, { all: true });

function blocked(message: string): never {
  throw new PublicHostError(message);
}

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
    if (a >= 224) return true; // multicast, reserved, and limited broadcast
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  if (lower.startsWith("ff")) return true;
  // IPv4-mapped IPv6: ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    if (net.isIPv4(mapped)) return isPrivateIp(mapped);
    const hexParts = mapped.split(":");
    if (hexParts.length === 2) {
      const hi = Number.parseInt(hexParts[0]!, 16);
      const lo = Number.parseInt(hexParts[1]!, 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const dotted = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
        return isPrivateIp(dotted);
      }
    }
    return true; // unparseable mapped form — fail closed
  }
  return false;
}

export function assertAllowedProtocol(protocol: string): void {
  if (protocol !== "http:" && protocol !== "https:") {
    blocked("Only http and https protocols are supported.");
  }
}

/** Reject localhost, private ranges, link-local, and cloud metadata targets. */
export async function assertPublicHost(
  hostname: string,
  { resolve = resolveWithNodeDns }: PublicHostDependencies = {}
): Promise<void> {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".local")
  ) {
    blocked("Requests to local/internal hosts are blocked.");
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) blocked("Requests to private IPs are blocked.");
    return;
  }
  let records: readonly ResolvedAddress[];
  try {
    records = await resolve(hostname);
  } catch {
    blocked("Could not resolve the requested host.");
  }
  if (!records.length) {
    blocked("Could not resolve the requested host.");
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      blocked("Host resolves to a private IP and is blocked.");
    }
  }
}

export async function assertPublicUrl(
  url: URL,
  dependencies?: PublicHostDependencies
): Promise<void> {
  assertAllowedProtocol(url.protocol);
  await assertPublicHost(url.hostname, dependencies);
}

export interface SafeFetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
  maxRedirects?: number;
  resolve?: HostResolver;
  fetch?: FetchImplementation;
}

/**
 * Fetch with manual redirect handling and per-hop DNS validation.
 *
 * Native fetch does not expose a portable way to pin its socket to a DNS answer.
 * Every redirect is therefore resolved and validated again, but an attacker who
 * changes DNS between validation and connection may still race Node's internal
 * resolver. Deployments should keep ENABLE_API_EXECUTION disabled unless needed
 * and constrain targets with an application allowlist.
 */
export async function safeFetch(
  initialUrl: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const resolve = options.resolve ?? resolveWithNodeDns;
  const fetchImpl = options.fetch ?? fetch;
  let current = new URL(initialUrl);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicUrl(current, { resolve });
    const response = await fetchImpl(current.toString(), {
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
        // Caller asked not to follow further (or budget exhausted) — return the
        // redirect so auth probes can re-attach query params onto Location.
        return response;
      }
      current = new URL(location, current);
      continue;
    }
    return response;
  }
  throw new PublicHostError("Too many redirects.");
}
