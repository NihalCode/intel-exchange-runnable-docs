#!/usr/bin/env tsx
/**
 * Build unanswered weekly aggregate snapshots (no raw query/IP).
 * Default is dry-run. Apply with: npm run analytics:weekly-unanswered -- --confirm
 * Usage: npm run analytics:weekly-unanswered [-- --organization-id=...] [-- --confirm]
 */
import { ensureMigrations, resetDatabaseConnection } from "../src/lib/db/client";
import { buildUnansweredWeeklySnapshots } from "../src/lib/query-analytics/unanswered-intel";

async function main() {
  ensureMigrations();
  const confirm = process.argv.includes("--confirm");
  const dryRun = !confirm;
  const orgArg =
    process.argv.find((a) => a.startsWith("--organization-id=")) ??
    process.argv.find((a) => a.startsWith("--org="));
  const organizationId = orgArg
    ? orgArg.includes("--organization-id=")
      ? orgArg.slice("--organization-id=".length)
      : orgArg.slice("--org=".length)
    : undefined;

  const result = await buildUnansweredWeeklySnapshots({
    organizationId,
    dryRun,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: result.dryRun,
        weekStart: result.weekStart,
        organizations: result.organizations,
        rowsUpserted: result.rowsUpserted,
        note: dryRun
          ? "Dry-run only. Pass --confirm to upsert weekly snapshots."
          : "Weekly snapshots upserted.",
      },
      null,
      2
    )
  );

  resetDatabaseConnection();
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
