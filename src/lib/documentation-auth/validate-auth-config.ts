import "server-only";

import { isPostgresConfigured } from "@/lib/db/client";
import {
  authEnvValidationError,
  getAuthEnv,
  initialOwnerEmail,
  initialOwnerEmailSource,
  isAuthEnvComplete,
  cleanEnvValue,
} from "@/lib/documentation-auth/env";

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

/** Safe server-side auth configuration validation — never exposes secret values. */
export function validateAuthConfig(): AuthConfigValidation {
  const env = getAuthEnv();
  const auth0EnvComplete = isAuthEnvComplete(env);
  const auth0SecretValid = authEnvValidationError(env) === null;
  const actionSharedSecretSet = Boolean(cleanEnvValue(process.env.AUTH0_ACTION_SHARED_SECRET));
  const appBaseUrlSet = Boolean(env.appBaseUrl);
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

  return {
    ok: issues.length === 0,
    issues,
    checks,
  };
}
