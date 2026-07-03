/** Auth config validation safe for CLI scripts (no server-only imports). */

export function cleanEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1).trim();
    return unquoted || null;
  }
  return trimmed;
}

export function normalizeAppBaseUrl(value: string | undefined): string | null {
  const clean = cleanEnvValue(value);
  if (!clean) return null;
  return clean.replace(/\/+$/, "");
}

const INITIAL_OWNER_ENV_KEYS = [
  "INITIAL_OWNER_EMAIL",
  "DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL",
  "INITIAL_ADMIN_EMAIL",
] as const;

export function initialOwnerEmailSource(): (typeof INITIAL_OWNER_ENV_KEYS)[number] | null {
  for (const key of INITIAL_OWNER_ENV_KEYS) {
    const raw = cleanEnvValue(process.env[key]);
    if (raw) return key;
  }
  return null;
}

export function initialOwnerEmail(): string | null {
  for (const key of INITIAL_OWNER_ENV_KEYS) {
    const raw = cleanEnvValue(process.env[key]);
    if (raw) return raw.trim().toLowerCase();
  }
  return null;
}

function auth0DomainFromEnv(): string | null {
  const issuer = cleanEnvValue(process.env.AUTH0_ISSUER_BASE_URL);
  if (issuer) {
    try {
      const host = new URL(issuer.startsWith("http") ? issuer : `https://${issuer}`).hostname;
      return host || null;
    } catch {
      return issuer.replace(/^https?:\/\//, "").replace(/\/+$/, "") || null;
    }
  }
  return cleanEnvValue(process.env.AUTH0_DOMAIN);
}

function isPostgresConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && (url.startsWith("postgres://") || url.startsWith("postgresql://")));
}

export interface AuthConfigChecks {
  auth0EnvComplete: boolean;
  auth0SecretValid: boolean;
  actionSharedSecretSet: boolean;
  appBaseUrlSet: boolean;
  databaseConfigured: boolean;
  vercelWithoutDatabase: boolean;
  initialOwnerEmailSet: boolean;
  initialOwnerEmailSource: string | null;
}

export interface AuthConfigValidation {
  ok: boolean;
  issues: string[];
  checks: AuthConfigChecks;
}

/** Safe auth configuration validation — never exposes secret values. */
export function validateAuthConfigPublic(): AuthConfigValidation {
  const domain = auth0DomainFromEnv();
  const clientId = cleanEnvValue(process.env.AUTH0_CLIENT_ID);
  const clientSecret = cleanEnvValue(process.env.AUTH0_CLIENT_SECRET);
  const secret = cleanEnvValue(process.env.AUTH0_SECRET);
  const appBaseUrl =
    normalizeAppBaseUrl(process.env.APP_BASE_URL) ??
    normalizeAppBaseUrl(process.env.AUTH0_BASE_URL);

  const auth0EnvComplete = Boolean(domain && clientId && clientSecret && secret && appBaseUrl);
  const auth0SecretValid = !secret || secret.length >= 32;
  const actionSharedSecretSet = Boolean(cleanEnvValue(process.env.AUTH0_ACTION_SHARED_SECRET));
  const appBaseUrlSet = Boolean(appBaseUrl);
  const databaseConfigured = isPostgresConfigured();
  const vercelWithoutDatabase = Boolean(process.env.VERCEL && !databaseConfigured);
  const ownerEmail = initialOwnerEmail();
  const ownerSource = initialOwnerEmailSource();

  const issues: string[] = [];

  if (!auth0EnvComplete) {
    issues.push(
      "Auth0 env incomplete: set AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, and APP_BASE_URL (or AUTH0_BASE_URL)."
    );
  } else if (!auth0SecretValid) {
    issues.push("AUTH0_SECRET must be at least 32 characters.");
  }

  if (!actionSharedSecretSet) {
    issues.push(
      "AUTH0_ACTION_SHARED_SECRET is unset — Auth0 Post-Login Action cannot verify invites; sign-in will fail with auth_config errors."
    );
  }

  if (!appBaseUrlSet) {
    issues.push("APP_BASE_URL (or AUTH0_BASE_URL) is unset — OAuth callbacks and invite-check will fail.");
  }

  if (vercelWithoutDatabase) {
    issues.push(
      "DATABASE_URL is unset on Vercel — user and invite data is stored in ephemeral /tmp SQLite and is lost on cold starts. Set a Postgres DATABASE_URL for production."
    );
  }

  if (!ownerEmail && vercelWithoutDatabase) {
    issues.push(
      "INITIAL_OWNER_EMAIL (or alias DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL / INITIAL_ADMIN_EMAIL) is unset — cold-start owner bootstrap cannot run."
    );
  }

  const checks: AuthConfigChecks = {
    auth0EnvComplete,
    auth0SecretValid,
    actionSharedSecretSet,
    appBaseUrlSet,
    databaseConfigured,
    vercelWithoutDatabase,
    initialOwnerEmailSet: Boolean(ownerEmail),
    initialOwnerEmailSource: ownerSource,
  };

  return { ok: issues.length === 0, issues, checks };
}
