/**
 * Repair missing query_analytics_events projection rows from authoritative attempts.
 * Default is dry-run. Apply with: npm run analytics:repair -- --confirm
 */
import { ensureMigrations, resetDatabaseConnection } from "../src/lib/db/client";
import { repairQueryAnalyticsProjection } from "../src/lib/query-analytics/reconcile";
import { processAnalyticsOutbox } from "../src/lib/query-analytics/service";

async function main() {
  ensureMigrations();
  const confirm = process.argv.includes("--confirm");
  const dryRun = !confirm;
  const orgArg = process.argv.find((a) => a.startsWith("--org="));
  const organizationId = orgArg ? orgArg.slice("--org=".length) : undefined;

  if (process.argv.includes("--process-outbox")) {
    const outbox = await processAnalyticsOutbox(100);
    console.log(JSON.stringify({ outbox }, null, 2));
  }

  const result = await repairQueryAnalyticsProjection({
    organizationId,
    dryRun,
    confirm,
  });

  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        wouldRepair: result.wouldRepair,
        repaired: result.repaired,
        reports: result.reports,
        note: dryRun
          ? "Dry-run only. Pass --confirm to apply repairs (audited)."
          : "Repairs applied and audited.",
      },
      null,
      2
    )
  );

  resetDatabaseConnection();
  process.exit(result.dryRun || result.reports.every((r) => r.exactMatch) ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
