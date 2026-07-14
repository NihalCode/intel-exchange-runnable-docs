/** True when the base URL is empty or still a docs placeholder (not a real tenant). */
export function isTemplateTenantBase(baseUrl: string): boolean {
  const u = (baseUrl || "").trim().toLowerCase();
  if (!u) return true;
  return (
    u.includes("tenantname") ||
    u.includes("your_tenant") ||
    u.includes("your-tenant") ||
    u.includes("sample.domain")
  );
}

/** True when the user pointed CFTR at the Postman docs host instead of a tenant API root. */
export function isCftrDocsHostBase(baseUrl: string): boolean {
  return isDocsHostBase(baseUrl, "cftrapi.cyware.com");
}

/** Public docs/reference hosts — not live tenant APIs (CFTR always 404s here; others may return 403 without auth). */
export function isDocsHostBase(baseUrl: string, hostname?: string): boolean {
  try {
    const u = new URL((baseUrl || "").trim());
    if (hostname) return u.hostname === hostname;
    return (
      u.hostname === "cftrapi.cyware.com" ||
      u.hostname === "csapapi.cyware.com" ||
      u.hostname === "orchestrateapi.cyware.com"
    );
  } catch {
    return false;
  }
}

export function docsHostWarning(productId?: string, baseUrl?: string): string | null {
  const base = (baseUrl || "").trim();
  if (!base || !isDocsHostBase(base)) return null;
  if (productId === "cftr" || isCftrDocsHostBase(base)) {
    return (
      "https://cftrapi.cyware.com is the CFTR API reference site, not a live tenant. " +
      "Ask your CFTR admin for your tenant API base (usually https://YOUR-TENANT.cyware.com/cftrapi). " +
      "Connected credentials cannot work against the docs host — you will get 404."
    );
  }
  if (productId === "csap") {
    return (
      "You are using csapapi.cyware.com (public reference host). If Run fails with 401/403, " +
      "your Access ID may be tied to a specific CSAP tenant URL — ask your admin for the correct base URL."
    );
  }
  if (productId === "orchestrate") {
    return (
      "You are using orchestrateapi.cyware.com (public reference host). If Run fails, " +
      "confirm with your admin whether your Orchestrate tenant uses a different base URL."
    );
  }
  return null;
}

export function isPostmanDocs404(status: number, body: string): boolean {
  return status === 404 && /static\.getpostman\.com|<title>\s*Not found/i.test(body);
}

export function needsConfiguredBaseUrl(baseUrl: string): boolean {
  return isTemplateTenantBase(baseUrl);
}

export function isCloudflareAccessBlock(status: number, body: string): boolean {
  if (status !== 403) return false;
  return /cloudflare access/i.test(body);
}

export function cloudflareAccessExplanation(): string {
  return (
    "Cloudflare Access blocked this request before it reached the Cyware API — this is not an Open API credential error. " +
    "The docs site sends requests through a server proxy (Vercel), which Cloudflare-protected tenants often reject. " +
    "Try npm run dev locally, or test with curl from your machine. Your tenant admin may need to exempt Open API paths from Cloudflare Access."
  );
}

export function templateTenantExplanation(): string {
  return (
    "Set your Cyware API base URL in API Settings. " +
    "CFTR: https://cftrapi.cyware.com · CSAP: https://csapapi.cyware.com · Orchestrate: https://orchestrateapi.cyware.com"
  );
}

export function csap404Explanation(baseUrl?: string): string {
  const base = (baseUrl || "").replace(/\/+$/, "");
  return (
    "404 — wrong CSAP path. Use GET {base}/csap/v1/… not {base}/v1/…. " +
    `For test connectivity try: ${base}/csap/v1/test_connectivity/ with AccessID, Signature, and Expires.`
  );
}

export function orchestrate404Explanation(baseUrl?: string): string {
  const base = (baseUrl || "").replace(/\/+$/, "");
  const probe =
    /\/soarapi$/i.test(base)
      ? `${base}/openapi/v1/test_connectivity/`
      : `${base}/v1/test_connectivity/`;
  return (
    "404 — check Orchestrate base URL and path (tenant …/soarapi/openapi or …/co). " +
    `Test connectivity: ${probe} with AccessID, Signature, and Expires.`
  );
}

export function postmanDocs404Explanation(productId?: string, baseUrl?: string): string {
  const cftrHint =
    "CFTR: use your tenant base (https://YOUR-TENANT.cyware.com/cftrapi) + GET /openapi/test-connectivity/ — " +
    "not https://cftrapi.cyware.com (docs host, returns 404).";
  const csapHint =
    "CSAP: try GET …/csap/v1/test_connectivity/ on your tenant or csapapi.cyware.com with AccessID, Signature, Expires.";
  const orchHint =
    "Orchestrate: try GET …/v1/test_connectivity/ with AccessID, Signature, Expires.";
  const byProduct: Record<string, string> = {
    cftr: cftrHint,
    csap: csapHint,
    orchestrate: orchHint,
  };
  const specific = productId ? byProduct[productId] : null;
  const docsHost = docsHostWarning(productId, baseUrl);
  return (
    "404 Not found — the API base URL or path does not exist on that host. " +
    (specific ?? `${csapHint} ${orchHint} ${cftrHint}`) +
    (docsHost ? ` ${docsHost}` : "")
  );
}

/** Short hint shown above response bodies when Cloudflare HTML is returned. */
export function responseRunHint(
  status: number,
  body: string,
  baseUrl: string,
  productId?: string
): string | null {
  const docsHost = docsHostWarning(productId, baseUrl);
  if (needsConfiguredBaseUrl(baseUrl)) return templateTenantExplanation();
  if (status === 404 && productId === "csap") return csap404Explanation(baseUrl);
  if (status === 404 && productId === "orchestrate") return orchestrate404Explanation(baseUrl);
  if (status === 404 && productId === "cftr") {
    return postmanDocs404Explanation("cftr", baseUrl);
  }
  if (isPostmanDocs404(status, body)) return postmanDocs404Explanation(productId, baseUrl);
  if (status === 404 && docsHost) return docsHost;
  if (isCloudflareAccessBlock(status, body)) return cloudflareAccessExplanation();
  return null;
}
