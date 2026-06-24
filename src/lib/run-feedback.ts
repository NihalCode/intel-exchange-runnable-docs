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

/** @deprecated CFTR uses cftrapi.cyware.com as the hosted API base. Kept for tests. */
export function isCftrDocsHostBase(baseUrl: string): boolean {
  return false;
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

export function postmanDocs404Explanation(): string {
  return (
    "404 Not found — check the API base URL and path. " +
    "CFTR test connectivity: https://cftrapi.cyware.com/cftrapi/openapi/test-connectivity/ with AccessID, Signature, and Expires."
  );
}

/** Short hint shown above response bodies when Cloudflare HTML is returned. */
export function responseRunHint(status: number, body: string, baseUrl: string): string | null {
  if (needsConfiguredBaseUrl(baseUrl)) return templateTenantExplanation();
  if (isPostmanDocs404(status, body)) return postmanDocs404Explanation();
  if (isCloudflareAccessBlock(status, body)) return cloudflareAccessExplanation();
  return null;
}
