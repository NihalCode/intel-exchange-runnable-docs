/** True when the base URL ends with /cftrapi on a tenant host (not cftrapi.cyware.com alone). */
export function isCftrTenantBaseUrl(baseUrl: string): boolean {
  const normalized = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) return false;
  try {
    const u = new URL(normalized);
    if (u.hostname === "cftrapi.cyware.com") return false;
    return /\/cftrapi$/i.test(u.pathname);
  } catch {
    return /\/cftrapi$/i.test(normalized);
  }
}

/**
 * Normalize CFTR endpoint paths.
 * - cftrapi.cyware.com: keep Postman paths (/cftrapi/openapi/…).
 * - tenant …/cftrapi: strip redundant /cftrapi prefix and use /openapi/… routes.
 */
export function normalizeCftrApiPath(rawPath: string, apiBaseUrl?: string): string {
  let path = rawPath.trim();
  if (!path.startsWith("/")) path = `/${path}`;

  if (isCftrTenantBaseUrl(apiBaseUrl ?? "")) {
    if (path.startsWith("/cftrapi/openapi/")) {
      path = path.replace(/^\/cftrapi/, "");
    } else if (path.startsWith("/cftrapi/")) {
      path = path.replace(/^\/cftrapi/, "");
    }
    if (/^\/test-connectivity\/?$/i.test(path)) {
      path = "/openapi/test-connectivity/";
    }
    if (path.startsWith("/v1/") && !path.startsWith("/openapi/")) {
      path = `/openapi${path}`;
    }
    return path;
  }

  if (/^\/test-connectivity\/?$/i.test(path)) {
    path = "/cftrapi/openapi/test-connectivity/";
  } else if (path.startsWith("/v1/") && !path.startsWith("/cftrapi/openapi/")) {
    path = `/cftrapi/openapi${path}`;
  } else if (path.startsWith("/openapi/") && !path.startsWith("/cftrapi/")) {
    path = `/cftrapi${path}`;
  }

  return path;
}
