# Phase 13: API Runner SSRF Hardening

Live execution remains disabled unless `ENABLE_API_EXECUTION=true`. When enabled, `/api/run` accepts only destinations matching the existing product registry's approved API base URL patterns, then validates every DNS answer for public addresses before it makes an outbound request.

`safeFetch` uses manual redirects and validates the scheme, hostname, and DNS answers at each hop. Localhost, private/link-local IPv4 and IPv6 ranges, cloud metadata addresses, multicast, and unsupported schemes are rejected. The resolver and fetch boundaries are injectable so SSRF tests use deterministic fake DNS and never query external DNS.

Node's standard `fetch` does not provide a portable, supported way to pin a connection to the IP address returned by a preceding DNS lookup. The runner re-resolves every redirect hop, including same-host redirects, but a DNS change in the interval between validation and Node's internal connection lookup remains a platform limitation. Keep the feature flag off outside approved environments and maintain the product destination allowlist. Client-facing failures are generic and the runner does not log request credentials.
