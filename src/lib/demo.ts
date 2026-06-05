import { DISPLAY_BASE } from "./constants";
import { isSensitiveName, looksLikePlaceholder, maskValue } from "./security";

/** True when the site should not call a real Cyware tenant (clone / local demo). */
export function isDemoModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

/** Snippet display base or unset — not a reachable tenant. */
export function isPlaceholderBase(baseUrl: string): boolean {
  const b = (baseUrl || "").trim();
  if (!b) return true;
  if (b === DISPLAY_BASE) return true;
  try {
    return new URL(b).hostname === "tenantname.com";
  } catch {
    return false;
  }
}

/** Request targets the docs placeholder host (never resolvable). */
export function isPlaceholderRequestUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "tenantname.com";
  } catch {
    return false;
  }
}

/**
 * Whether /api/run should return a simulated response instead of calling the network.
 * Placeholder host `tenantname.com` is always simulated — it is not a real API endpoint.
 */
export function shouldSimulateRequest(url: string, explicitDemo?: boolean): boolean {
  if (explicitDemo) return true;
  if (isPlaceholderRequestUrl(url)) return true;
  return false;
}

export interface DemoProxyResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { name: string; value: string }[];
  body: string;
  durationMs: number;
}

export function buildDemoResponse(
  method: string,
  url: string,
  body?: string
): DemoProxyResult {
  const m = method.toUpperCase();
  let path = "/";
  let queryParams: Record<string, string> = {};
  try {
    const u = new URL(url);
    path = u.pathname;
    u.searchParams.forEach((value, name) => {
      if (isSensitiveName(name) || looksLikePlaceholder(value)) {
        queryParams[name] = value ? maskValue(value) : "(not set)";
      } else {
        queryParams[name] = value;
      }
    });
  } catch {
    /* ignore */
  }

  const normalized = path.replace(/\/+$/, "") || "/";

  let payload: Record<string, unknown>;

  if (normalized.endsWith("/ping") || normalized === "/ping") {
    payload = {
      status: "ok",
      message: "pong",
      demo: true,
      note: "Simulated response — this docs clone does not call a live Cyware tenant.",
      ...(Object.keys(queryParams).length ? { query: queryParams } : {}),
    };
  } else if (m === "GET" || m === "HEAD") {
    payload = {
      demo: true,
      method: m,
      path: normalized,
      results: [],
      count: 0,
      message: "Simulated GET response for documentation preview.",
      ...(Object.keys(queryParams).length ? { query: queryParams } : {}),
    };
  } else {
    let parsedBody: unknown = undefined;
    if (body?.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }
    }
    payload = {
      demo: true,
      method: m,
      path: normalized,
      status: "success",
      message: `Simulated ${m} response — no data was sent to a live API.`,
      ...(parsedBody !== undefined ? { request_body: parsedBody } : {}),
    };
  }

  const bodyText = JSON.stringify(payload, null, 2);
  return {
    ok: true,
    status: 200,
    statusText: "OK (demo)",
    headers: [{ name: "Content-Type", value: "application/json" }],
    body: bodyText,
    durationMs: 12,
  };
}
