import { isSensitiveName, looksLikePlaceholder, maskValue } from "./security";

/** Optional simulated responses when `NEXT_PUBLIC_DEMO_MODE=true` and client sends `demo: true`. */
export function isDemoModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

/** Only an unset base URL is treated as unconfigured. */
export function isPlaceholderBase(baseUrl: string): boolean {
  return !(baseUrl || "").trim();
}

/** Live API requests are never auto-simulated by hostname. */
export function isPlaceholderRequestUrl(_url: string): boolean {
  return false;
}

/** Simulate only when the client explicitly opts in and demo mode is enabled. */
export function shouldSimulateRequest(_url: string, explicitDemo?: boolean): boolean {
  return Boolean(explicitDemo && isDemoModeEnabled());
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
      note: "Simulated response (explicit demo mode).",
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
