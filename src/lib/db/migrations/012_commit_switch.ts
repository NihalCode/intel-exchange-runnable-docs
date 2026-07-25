/**
 * Migration 012 — deployment commit switch change-request link table.
 * Additive; SQLite + Postgres with org RLS on Postgres.
 */

export const SQLITE_COMMIT_SWITCH_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS deployment_commit_change_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL REFERENCES product_deployments(id) ON DELETE CASCADE,
  change_request_id TEXT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  vercel_deployment_id TEXT NOT NULL,
  commit_sha TEXT,
  from_commit_sha TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','expired','failed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, change_request_id)
);
CREATE INDEX IF NOT EXISTS idx_deployment_commit_change_deployment
  ON deployment_commit_change_requests(organization_id, deployment_id, status);
CREATE INDEX IF NOT EXISTS idx_deployment_commit_change_vercel
  ON deployment_commit_change_requests(organization_id, vercel_deployment_id, status);
`;

export const POSTGRES_COMMIT_SWITCH_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS deployment_commit_change_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL REFERENCES product_deployments(id) ON DELETE CASCADE,
  change_request_id TEXT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  vercel_deployment_id TEXT NOT NULL,
  commit_sha TEXT,
  from_commit_sha TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','expired','failed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, change_request_id)
);
CREATE INDEX IF NOT EXISTS idx_deployment_commit_change_deployment
  ON deployment_commit_change_requests(organization_id, deployment_id, status);
CREATE INDEX IF NOT EXISTS idx_deployment_commit_change_vercel
  ON deployment_commit_change_requests(organization_id, vercel_deployment_id, status);
ALTER TABLE deployment_commit_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_commit_change_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deployment_commit_change_requests_tenant ON deployment_commit_change_requests;
CREATE POLICY deployment_commit_change_requests_tenant ON deployment_commit_change_requests
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text);
`;
