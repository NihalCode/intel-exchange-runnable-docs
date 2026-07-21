/**
 * Reconcile authoritative query analytics vs compatibility projection.
 * Usage: npm run analytics:reconcile [-- --org=<organizationId>]
 */
import { ensureMigrations, resetDatabaseConnection } from "../src/lib/db/client";
import { reconcileQueryAnalytics } from "../src/lib/query-analytics/reconcile";

async function main() {
  ensureMigrations();
  const orgArg = process.argv.find((a) => a.startsWith("--org="));
  const organizationId = orgArg ? orgArg.slice("--org=".length) : undefined;
  const reports = await reconcileQueryAnalytics(organizationId);

  console.log(JSON.stringify({ ok: reports.every((r) => r.exactMatch), reports }, null, 2));
  resetDatabaseConnection();
  process.exit(reports.every((r) => r.exactMatch) ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
