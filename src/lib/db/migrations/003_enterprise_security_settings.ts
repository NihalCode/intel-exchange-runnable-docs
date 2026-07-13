export const SQLITE_SECURITY_SETTINGS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS organization_security_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
`;

export const POSTGRES_SECURITY_SETTINGS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS organization_security_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organization_security_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON organization_security_settings;
CREATE POLICY organization_isolation ON organization_security_settings
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')
  );
`;
