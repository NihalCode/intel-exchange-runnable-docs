/**
 * Safe auth configuration diagnostics — prints status only, never secret values.
 * Usage: npm run auth:diagnose
 */
import { validateAuthConfig } from "../src/lib/documentation-auth/validate-auth-config";
import { countActiveUsers } from "../src/lib/db/repository";
import { getDbBackend, isPostgresConfigured } from "../src/lib/db/client";

async function main(): Promise<void> {
  console.log("Cyware API Docs — auth diagnostics\n");

  const config = validateAuthConfig();

  console.log("Configuration checks:");
  for (const [key, value] of Object.entries(config.checks)) {
    console.log(`  ${key}: ${JSON.stringify(value)}`);
  }

  if (config.issues.length > 0) {
    console.log("\nIssues:");
    for (const issue of config.issues) {
      console.log(`  - ${issue}`);
    }
  } else {
    console.log("\nNo configuration issues detected.");
  }

  console.log(`\nDatabase backend: ${isPostgresConfigured() ? getDbBackend() : "sqlite (local)"}`);

  try {
    const activeUserCount = await countActiveUsers();
    console.log(`Active users: ${activeUserCount}`);
    if (activeUserCount === 0 && !config.checks.initialOwnerEmailSet) {
      console.log(
        "\nWarning: zero active users and no INITIAL_OWNER_EMAIL — first owner cannot bootstrap."
      );
    }
  } catch (error) {
    console.log(`Database unreachable: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  console.log(`\nOverall: ${config.ok ? "OK" : "NEEDS ATTENTION"}`);
  process.exit(config.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
