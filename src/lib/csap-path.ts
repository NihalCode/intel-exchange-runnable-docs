/**
 * Normalize CSAP endpoint paths from ingested docs.
 * Tenant bases like https://tenant.cyware.com/api/ require csap/v1/… not v1/… alone.
 */
export function normalizeCsapApiPath(rawPath: string): string {
  let path = rawPath.trim();
  if (!path) return path;
  if (path.startsWith("/")) path = path.slice(1);
  if (path.startsWith("csap/")) return path;
  if (path.startsWith("v1/")) return `csap/${path}`;
  return path;
}
