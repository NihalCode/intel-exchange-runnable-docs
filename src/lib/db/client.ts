import "server-only";

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { Pool, type PoolClient } from "pg";

import {
  DB_MIGRATIONS,
  POSTGRES_MIGRATION_LEDGER_SQL,
  SQLITE_MIGRATION_LEDGER_SQL,
} from "@/lib/db/migrations";

export type DbBackend = "sqlite" | "postgres";

let sqliteDb: Database.Database | null = null;
let pgPool: Pool | null = null;
let pgInitialization: Promise<Pool> | null = null;
let activeBackend: DbBackend | null = null;
let testDbPath: string | null = null;
let sqliteTransactionQueue: Promise<void> = Promise.resolve();

export interface DbExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

export interface OrganizationDbContext {
  organizationId: string;
  userId: string;
}

export function isPostgresConfigured(): boolean {
  const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
  return Boolean(url && (url.startsWith("postgres://") || url.startsWith("postgresql://")));
}

/**
 * Strip wrapping quotes and ensure SSL on Vercel-hosted Postgres URLs.
 * Never logs the connection string.
 */
export function normalizeDatabaseUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  let value = trimmed;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (!value) return null;

  const onVercel = Boolean(process.env.VERCEL);
  const isLocal = /localhost|127\.0\.0\.1/i.test(value);
  if (onVercel && !isLocal && !/[?&]sslmode=/i.test(value)) {
    value += value.includes("?") ? "&sslmode=require" : "?sslmode=require";
  }
  return value;
}

export interface DatabaseProbeResult {
  configured: boolean;
  connected: boolean;
  reasonCode?:
    | "not_configured"
    | "connection_failed"
    | "migration_failed"
    | "query_failed"
    | "ok";
  safeMessage?: string;
  migrationVersion?: number;
}

/** Probe DB without exposing connection details. Prefer for health/auth diagnostics. */
export async function probeDatabase(): Promise<DatabaseProbeResult> {
  if (!isPostgresConfigured()) {
    return {
      configured: false,
      connected: false,
      reasonCode: "not_configured",
      safeMessage: "DATABASE_URL is unset or not a postgres URL.",
    };
  }
  try {
    await db.queryOne("SELECT 1 AS ok");
    let migrationVersion: number | undefined;
    try {
      const row = await db.queryOne<{ version: number | string }>(
        "SELECT MAX(version) AS version FROM schema_migrations"
      );
      if (row?.version != null) migrationVersion = Number(row.version);
    } catch {
      // table may not exist yet — connection still works
    }
    return {
      configured: true,
      connected: true,
      reasonCode: "ok",
      migrationVersion,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const lower = message.toLowerCase();
    const migrationFailed =
      lower.includes("migration") ||
      lower.includes("schema_migrations") ||
      lower.includes("syntax error");
    return {
      configured: true,
      connected: false,
      reasonCode: migrationFailed ? "migration_failed" : "connection_failed",
      safeMessage: migrationFailed
        ? "Postgres connected but migrations failed. Check Vercel function logs for schema errors."
        : "Postgres connection failed. Verify DATABASE_URL (use pooled host if Neon), include sslmode=require, redeploy, and confirm the DB allows Vercel IPs.",
    };
  }
}

export function getDbBackend(): DbBackend {
  return isPostgresConfigured() ? "postgres" : "sqlite";
}

/** Point SQLite at a specific file (tests). */
export function setTestDatabasePath(filePath: string | null): void {
  testDbPath = filePath;
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
    activeBackend = null;
  }
}

export function resetDatabaseConnection(): void {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
  if (pgPool) {
    void pgPool.end();
    pgPool = null;
  }
  pgInitialization = null;
  activeBackend = null;
}

function defaultSqlitePath(): string {
  if (testDbPath) return testDbPath;
  if (process.env.VERCEL && !process.env.DATABASE_URL?.trim()) {
    return "/tmp/documentation-auth.db";
  }
  return path.join(process.cwd(), ".data", "documentation-auth.db");
}

function getSqliteDb(): Database.Database {
  if (sqliteDb) return sqliteDb;
  const dbPath = defaultSqlitePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");
  applySqliteMigrations(sqliteDb);
  activeBackend = "sqlite";
  return sqliteDb;
}

function applySqliteMigrations(db: Database.Database): void {
  db.exec(SQLITE_MIGRATION_LEDGER_SQL);
  const applied = db
    .prepare("SELECT version FROM schema_migrations")
    .all()
    .map((row) => Number((row as { version: number }).version));
  const appliedVersions = new Set(applied);
  for (const migration of DB_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;
    const apply = db.transaction(() => {
      db.exec(migration.sqlite);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      ).run(migration.version, migration.name, new Date().toISOString());
    });
    apply();
  }
}

async function getPgPool(): Promise<Pool> {
  if (pgPool) return pgPool;
  if (pgInitialization) return pgInitialization;
  pgInitialization = (async () => {
    const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL) ?? "";
    const useSsl =
      process.env.PGSSLMODE === "require" ||
      /sslmode=require/i.test(connectionString) ||
      (Boolean(process.env.VERCEL) && !/localhost|127\.0\.0\.1/i.test(connectionString));

    const pool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 20_000,
      max: 5,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [2026071301]);
      await client.query(POSTGRES_MIGRATION_LEDGER_SQL);
      const result = await client.query<{ version: number }>(
        "SELECT version FROM schema_migrations"
      );
      const applied = new Set(result.rows.map((row) => Number(row.version)));
      for (const migration of DB_MIGRATIONS) {
        if (applied.has(migration.version)) continue;
        await client.query(migration.postgres);
        await client.query(
          "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
          [migration.version, migration.name]
        );
      }
      await client.query("COMMIT");
      client.release();
      pgPool = pool;
      activeBackend = "postgres";
      return pool;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failures after connect/migration errors
      }
      client.release();
      await pool.end();
      pgInitialization = null;
      throw error;
    }
  })();
  return pgInitialization;
}

export async function runQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (isPostgresConfigured()) {
    const pool = await getPgPool();
    const converted = convertPlaceholders(sql, params);
    const result = await pool.query(converted.sql, converted.params);
    return result.rows as T[];
  }
  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  if (!stmt.reader) {
    stmt.run(...params);
    return [];
  }
  return stmt.all(...params) as T[];
}

export async function runQueryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await runQuery<T>(sql, params);
  return rows[0] ?? null;
}

export async function runExecute(sql: string, params: unknown[] = []): Promise<void> {
  if (isPostgresConfigured()) {
    const pool = await getPgPool();
    const converted = convertPlaceholders(sql, params);
    await pool.query(converted.sql, converted.params);
    return;
  }
  const db = getSqliteDb();
  db.prepare(sql).run(...params);
}

export const db: DbExecutor = {
  query: runQuery,
  queryOne: runQueryOne,
  execute: runExecute,
};

function executorForPostgres(client: PoolClient): DbExecutor {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const converted = convertPlaceholders(sql, params);
      const result = await client.query(converted.sql, converted.params);
      return result.rows as T[];
    },
    async queryOne<T>(sql: string, params: unknown[] = []) {
      const rows = await this.query<T>(sql, params);
      return rows[0] ?? null;
    },
    async execute(sql: string, params: unknown[] = []) {
      const converted = convertPlaceholders(sql, params);
      await client.query(converted.sql, converted.params);
    },
  };
}

function executorForSqlite(db: Database.Database): DbExecutor {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const statement = db.prepare(sql);
      if (!statement.reader) {
        statement.run(...params);
        return [];
      }
      return statement.all(...params) as T[];
    },
    async queryOne<T>(sql: string, params: unknown[] = []) {
      const statement = db.prepare(sql);
      return (statement.get(...params) as T | undefined) ?? null;
    },
    async execute(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...params);
    },
  };
}

/**
 * Runs a callback atomically. Repository/service code should use the supplied
 * executor for every operation in the callback.
 */
export async function withTransaction<T>(
  callback: (transaction: DbExecutor) => Promise<T>
): Promise<T> {
  if (isPostgresConfigured()) {
    const pool = await getPgPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(executorForPostgres(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const previous = sqliteTransactionQueue;
  let releaseQueue!: () => void;
  sqliteTransactionQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  const db = getSqliteDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = await callback(executorForSqlite(db));
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    releaseQueue();
  }
}

/**
 * Applies transaction-local RLS identity on Postgres. SQLite has no RLS, so
 * repositories must still include organization_id in every query.
 */
export async function withOrganizationTransaction<T>(
  context: OrganizationDbContext,
  callback: (transaction: DbExecutor) => Promise<T>
): Promise<T> {
  if (!context.organizationId || !context.userId) {
    throw new Error("Organization and user context are required");
  }
  return withTransaction(async (transaction) => {
    if (isPostgresConfigured()) {
      await transaction.query("SELECT set_config('app.organization_id', ?, true)", [
        context.organizationId,
      ]);
      await transaction.query("SELECT set_config('app.user_id', ?, true)", [
        context.userId,
      ]);
    }
    return callback(transaction);
  });
}

function convertPlaceholders(
  sql: string,
  params: unknown[]
): { sql: string; params: unknown[] } {
  let index = 0;
  const converted = sql.replace(/\?/g, () => `$${++index}`);
  return { sql: converted, params };
}

export function ensureMigrations(): void {
  if (isPostgresConfigured()) return;
  getSqliteDb();
}

export function getActiveBackend(): DbBackend | null {
  return activeBackend ?? (isPostgresConfigured() ? "postgres" : "sqlite");
}
