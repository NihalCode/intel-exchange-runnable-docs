import { cleanEnvValue, normalizeAppBaseUrl } from "@/lib/documentation-auth/env-values";

export { cleanEnvValue, normalizeAppBaseUrl };

/** Resolve canonical app origin from env (works in CLI scripts and on Vercel). */
export function resolveAppBaseUrlFromEnv(): string | null {
  const vercelUrl = cleanEnvValue(process.env.VERCEL_URL);
  const vercelProduction = cleanEnvValue(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  const vercelBranch = cleanEnvValue(process.env.VERCEL_BRANCH_URL);

  return (
    normalizeAppBaseUrl(process.env.APP_BASE_URL) ??
    normalizeAppBaseUrl(process.env.AUTH0_BASE_URL) ??
    (vercelProduction ? normalizeAppBaseUrl(`https://${vercelProduction}`) : null) ??
    (vercelBranch ? normalizeAppBaseUrl(`https://${vercelBranch}`) : null) ??
    (vercelUrl ? normalizeAppBaseUrl(`https://${vercelUrl}`) : null)
  );
}
