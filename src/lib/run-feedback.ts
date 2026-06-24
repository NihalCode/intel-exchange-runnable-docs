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
    "Set your Cyware API base URL in API Settings (key icon). " +
    "CFTR: https://cftrapi.cyware.com — or your dedicated tenant URL like https://mycompany.cyware.com/cftrapi."
  );
}

/** Short hint shown above response bodies when Cloudflare HTML is returned. */
export function responseRunHint(status: number, body: string, baseUrl: string): string | null {
  if (needsConfiguredBaseUrl(baseUrl)) return templateTenantExplanation();
  if (isCloudflareAccessBlock(status, body)) return cloudflareAccessExplanation();
  return null;
}
