import { isProductKey, type ProductKey } from "@/lib/products/registry";

export interface QueryAnalyticsFilters {
  sinceIso: string;
  untilIso?: string;
  productId?: ProductKey | null;
  hostname?: string | null;
  outcome?: string | null;
}

/** Docs/example placeholders must never become active hostname filters. */
const PLACEHOLDER_HOSTNAME_RE = /(^|\.)example\.com$/i;

export function normalizeAnalyticsHostname(
  raw: string | null | undefined
): string | undefined {
  const hostname = raw?.trim();
  if (!hostname) return undefined;
  if (PLACEHOLDER_HOSTNAME_RE.test(hostname)) return undefined;
  return hostname;
}

/** Parse a since bound; date-only values use UTC midnight. */
export function parseAnalyticsSinceIso(
  raw: string | undefined,
  fallbackMs: number
): string {
  if (!raw?.trim()) return new Date(fallbackMs).toISOString();
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return new Date(fallbackMs).toISOString();
  return new Date(ms).toISOString();
}

/**
 * Parse an until bound. Date-only values use end-of-UTC-day so a picker
 * range like 06/22–07/22 includes events on 07/22.
 */
export function parseAnalyticsUntilIso(
  raw: string | undefined,
  fallbackMs: number
): string {
  if (!raw?.trim()) return new Date(fallbackMs).toISOString();
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T23:59:59.999Z`).toISOString();
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return new Date(fallbackMs).toISOString();
  return new Date(ms).toISOString();
}

export function parseAnalyticsFiltersFromParams(
  params: {
    since?: string | null;
    until?: string | null;
    productId?: string | null;
    hostname?: string | null;
    outcome?: string | null;
  },
  nowMs = Date.now()
): QueryAnalyticsFilters {
  const productRaw = params.productId?.trim();
  return {
    sinceIso: parseAnalyticsSinceIso(
      params.since ?? undefined,
      nowMs - 30 * 24 * 60 * 60 * 1000
    ),
    untilIso: parseAnalyticsUntilIso(params.until ?? undefined, nowMs),
    productId:
      productRaw && isProductKey(productRaw) ? (productRaw as ProductKey) : undefined,
    hostname: normalizeAnalyticsHostname(params.hostname),
    outcome: params.outcome?.trim() || undefined,
  };
}

/** Default admin toolbar filters: last 30 days, all products, all hosts. */
export function defaultAnalyticsFilters(nowMs = Date.now()): QueryAnalyticsFilters {
  return parseAnalyticsFiltersFromParams({}, nowMs);
}

export function classifyAnalyticsQueryError(err: unknown): {
  code: string;
  message: string;
} {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "analytics_query_failed";
  const lower = message.toLowerCase();
  let code = "ANALYTICS_QUERY_FAILED";
  if (lower.includes("timestamp with time zone") && lower.includes("text")) {
    code = "PG_TIMESTAMPTZ_TEXT_COMPARE";
  } else if (lower.includes("42p18") || lower.includes("could not determine data type")) {
    code = "PG_INDETERMINATE_PARAM_TYPE";
  } else if (lower.includes("relation") && lower.includes("does not exist")) {
    code = "MISSING_RELATION";
  } else if (lower.includes("permission denied") || lower.includes("row-level security")) {
    code = "PG_RLS_DENIED";
  }
  return { code, message };
}
