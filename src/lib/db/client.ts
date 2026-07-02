import "server-only";

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { Pool } from "pg";

import { MIGRATION_SQL, POSTGRES_MIGRATION_SQL } from "@/lib/db/migrations/001_initial";

export type DbBackend = "sqlite" | "postgres";

let sqliteDb: Database.Database | null = null;
let pgPool: Pool | null = null;
let activeBackend: DbBackend | null = null;
let testDbPath: string | null = null;

export function isPostgresConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && (url.startsWith("postgres://") || url.startsWith("postgresql://")));
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
  sqliteDb.exec(MIGRATION_SQL);
  activeBackend = "sqlite";
  return sqliteDb;
}

async function getPgPool(): Promise<Pool> {
  if (pgPool) return pgPool;
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pgPool.query(POSTGRES_MIGRATION_SQL);
  activeBackend = "postgres";
  return pgPool;
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
  if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) {
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
