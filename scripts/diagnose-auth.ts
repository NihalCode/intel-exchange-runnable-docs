/**
 * Safe auth configuration diagnostics — prints status only, never secret values.
 * Usage: npm run auth:diagnose
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { validateAuthConfigPublic } from "../src/lib/documentation-auth/auth-config-public";

/** Load KEY=value from .env.local into process.env when unset (no secret printing). */
function loadDotEnvLocal(): void {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvLocal();

function sourceMentions(relPath: string, pattern: RegExp): boolean {
  try {
    const text = readFileSync(join(process.cwd(), relPath), "utf8");
    return pattern.test(text);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log("Cyware API Docs — auth diagnostics\n");

  const config = validateAuthConfigPublic();

  console.log("Configuration checks:");
  for (const [key, value] of Object.entries(config.checks)) {
    console.log(`  ${key}: ${JSON.stringify(value)}`);
  }

  console.log("\nOkta enterprise connection routing:");
  console.log(
    `  AUTH0_OKTA_CONNECTION configured: ${config.checks.oktaConnectionConfigured ? "yes" : "no"}`
  );
  console.log(
    `  Okta connection parameter applied: ${
      sourceMentions("src/lib/auth0.ts", /connection:\s*getRequiredOktaConnection/) ||
      sourceMentions("src/lib/documentation-auth/password-connection.ts", /getRequiredOktaConnection/)
        ? "yes"
        : "no"
    }`
  );
  console.log(
    `  Database login path detected: ${
      sourceMentions("src/app/sign-up/page.tsx", /screen_hint\s*[:=]|Username-Password-Authentication/) ||
      sourceMentions(
        "src/lib/documentation-auth/password-connection.ts",
        /params\.set\(\s*["']screen_hint["']|screen_hint\s*:/
      )
        ? "yes"
        : "no"
    }`
  );
  console.log(
    `  Google login path detected: ${
      sourceMentions("src/app/sign-in/page.tsx", /login-continue-google|google-oauth2/)
        ? "yes"
        : "no"
    }`
  );
  console.log(
    `  Auth0 MFA / Guardian ACR detected: ${
      sourceMentions("src/lib/enterprise/mfa-step-up.ts", /acr_values\s*[:=]/) ||
      sourceMentions("src/lib/enterprise/mfa-step-up.ts", /api\.multifactor\.enable/)
        ? "yes"
        : "no"
    }`
  );
  console.log(
    `  Step-up uses Okta connection: ${
      sourceMentions(
        "src/lib/enterprise/mfa-step-up.ts",
        /getRequiredOktaConnection|AUTH0_OKTA_CONNECTION/
      )
        ? "yes"
        : "no"
    }`
  );

  if (config.issues.length > 0) {
    console.log("\nIssues:");
    for (const issue of config.issues) {
      console.log(`  - ${issue}`);
    }
  } else {
    console.log("\nNo configuration issues detected.");
  }

  console.log(
    `\nDatabase backend: ${config.checks.databaseConfigured ? "postgres" : "sqlite (local or ephemeral on Vercel)"}`
  );
  console.log(
    "Active user count: run GET /api/admin/auth-diagnostics when signed in as admin for live DB state."
  );

  if (!config.checks.initialOwnerEmailSet && config.checks.vercelWithoutDatabase) {
    console.log(
      "\nWarning: no INITIAL_OWNER_EMAIL and no Postgres on Vercel — first owner cannot bootstrap."
    );
  }

  console.log(`\nOverall: ${config.ok ? "OK" : "NEEDS ATTENTION"}`);
  process.exit(config.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
