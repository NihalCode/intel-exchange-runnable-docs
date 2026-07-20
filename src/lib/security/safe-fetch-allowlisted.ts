/**
 * Extend safeFetch with an optional destination allowlist checked on every hop
 * (including redirects). Used by /api/run so product allowlist cannot be bypassed
 * via Location headers.
 */

import {
  assertPublicUrl,
  PublicHostError,
  type HostResolver,
  type FetchImplementation,
  type SafeFetchOptions,
} from "@/lib/security/public-host";

export type DestinationAllowlist = (url: URL) => boolean;

export interface AllowlistedFetchOptions extends SafeFetchOptions {
  /** When set, every hop (initial + redirects) must pass. */
  assertDestination?: DestinationAllowlist;
}

export async function safeFetchAllowlisted(
  initialUrl: string,
  options: AllowlistedFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const resolve = options.resolve;
  const fetchImpl = options.fetch ?? fetch;
  const assertDestination = options.assertDestination;
  let current = new URL(initialUrl);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (assertDestination && !assertDestination(current)) {
      throw new PublicHostError("Redirect or destination is not on the allowlist.");
    }
    await assertPublicUrl(current, resolve ? { resolve } : undefined);

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
        throw new PublicHostError("Too many redirects.");
      }
      current = new URL(location, current);
      continue;
    }
    return response;
  }
  throw new PublicHostError("Too many redirects.");
}

export type { HostResolver, FetchImplementation };
