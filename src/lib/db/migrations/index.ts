import {
  MIGRATION_SQL,
  POSTGRES_MIGRATION_SQL,
} from "@/lib/db/migrations/001_initial";
import {
  POSTGRES_ENTERPRISE_MIGRATION_SQL,
  SQLITE_ENTERPRISE_MIGRATION_SQL,
} from "@/lib/db/migrations/002_enterprise_control_plane";
import {
  POSTGRES_SECURITY_SETTINGS_MIGRATION_SQL,
  SQLITE_SECURITY_SETTINGS_MIGRATION_SQL,
} from "@/lib/db/migrations/003_enterprise_security_settings";
import {
  POSTGRES_DOCUMENTATION_PLATFORM_MIGRATION_SQL,
  SQLITE_DOCUMENTATION_PLATFORM_MIGRATION_SQL,
} from "@/lib/db/migrations/004_documentation_platform";
import {
  POSTGRES_AGENT_CONVERSATIONS_MIGRATION_SQL,
  SQLITE_AGENT_CONVERSATIONS_MIGRATION_SQL,
} from "@/lib/db/migrations/005_agent_conversations";
import {
  POSTGRES_MULTI_DOMAIN_ANALYTICS_MIGRATION_SQL,
  SQLITE_MULTI_DOMAIN_ANALYTICS_MIGRATION_SQL,
} from "@/lib/db/migrations/006_multi_domain_analytics";

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
  {
    version: 3,
    name: "enterprise_security_settings",
    sqlite: SQLITE_SECURITY_SETTINGS_MIGRATION_SQL,
    postgres: POSTGRES_SECURITY_SETTINGS_MIGRATION_SQL,
  },
  {
    version: 4,
    name: "documentation_platform",
    sqlite: SQLITE_DOCUMENTATION_PLATFORM_MIGRATION_SQL,
    postgres: POSTGRES_DOCUMENTATION_PLATFORM_MIGRATION_SQL,
  },
  {
    version: 5,
    name: "agent_conversations",
    sqlite: SQLITE_AGENT_CONVERSATIONS_MIGRATION_SQL,
    postgres: POSTGRES_AGENT_CONVERSATIONS_MIGRATION_SQL,
  },
  {
    version: 6,
    name: "multi_domain_analytics",
    sqlite: SQLITE_MULTI_DOMAIN_ANALYTICS_MIGRATION_SQL,
    postgres: POSTGRES_MULTI_DOMAIN_ANALYTICS_MIGRATION_SQL,
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
