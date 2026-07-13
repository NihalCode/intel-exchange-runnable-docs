import {
  MIGRATION_SQL,
  POSTGRES_MIGRATION_SQL,
} from "@/lib/db/migrations/001_initial";
import {
  POSTGRES_ENTERPRISE_MIGRATION_SQL,
  SQLITE_ENTERPRISE_MIGRATION_SQL,
} from "@/lib/db/migrations/002_enterprise_control_plane";

export interface VersionedMigration {
  version: number;
  name: string;
  sqlite: string;
  postgres: string;
}

/**
 * 001 remains byte-for-byte compatible with existing databases. New migrations
 * are append-only and must never be reordered or edited after deployment.
 */
export const DB_MIGRATIONS: readonly VersionedMigration[] = [
  {
    version: 1,
    name: "initial_documentation_auth",
    sqlite: MIGRATION_SQL,
    postgres: POSTGRES_MIGRATION_SQL,
  },
  {
    version: 2,
    name: "enterprise_control_plane",
    sqlite: SQLITE_ENTERPRISE_MIGRATION_SQL,
    postgres: POSTGRES_ENTERPRISE_MIGRATION_SQL,
  },
] as const;

export const SQLITE_MIGRATION_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`;

export const POSTGRES_MIGRATION_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
