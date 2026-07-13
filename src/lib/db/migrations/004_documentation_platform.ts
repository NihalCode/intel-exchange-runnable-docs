export const SQLITE_DOCUMENTATION_PLATFORM_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS user_product_credentials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  base_url TEXT NOT NULL,
  access_id_masked TEXT NOT NULL,
  secret_ciphertext TEXT,
  secret_iv TEXT,
  secret_tag TEXT,
  vault_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  authorized_scopes_json TEXT NOT NULL DEFAULT '[]',
  validated_at TEXT,
  expires_at TEXT,
  validation_error_code TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_user_product_credentials_gate
  ON user_product_credentials(organization_id, user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS documentation_feature_flags (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  allowed_environments_json TEXT NOT NULL DEFAULT '[]',
  allowed_roles_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  modified_by TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS documentation_schemas (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  format TEXT NOT NULL,
  product_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  active_version_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, slug, environment)
);

CREATE TABLE IF NOT EXISTS documentation_schema_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  schema_id TEXT NOT NULL REFERENCES documentation_schemas(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  validation_json TEXT NOT NULL DEFAULT '{}',
  diff_json TEXT NOT NULL DEFAULT '{}',
  preview_json TEXT NOT NULL DEFAULT '{}',
  breaking_count INTEGER NOT NULL DEFAULT 0,
  author_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  approver_user_id TEXT REFERENCES documentation_users(id),
  review_reason TEXT,
  published_at TEXT,
  rollback_of_version_id TEXT REFERENCES documentation_schema_versions(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, schema_id, version_number),
  UNIQUE (organization_id, schema_id, source_hash)
);
CREATE INDEX IF NOT EXISTS idx_documentation_schema_versions_state
  ON documentation_schema_versions(organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS documentation_publications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  schema_id TEXT NOT NULL REFERENCES documentation_schemas(id) ON DELETE CASCADE,
  schema_version_id TEXT NOT NULL REFERENCES documentation_schema_versions(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  error_code TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS documentation_user_provisioning (
  user_id TEXT PRIMARY KEY REFERENCES documentation_users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TEXT,
  allowed_environments_json TEXT NOT NULL DEFAULT '[]',
  feature_metadata_json TEXT NOT NULL DEFAULT '{}',
  provider_setup_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const POSTGRES_DOCUMENTATION_PLATFORM_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS user_product_credentials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL CHECK (product_id IN ('ctix','cftr','orchestrate','csap')),
  base_url TEXT NOT NULL,
  access_id_masked TEXT NOT NULL,
  secret_ciphertext TEXT,
  secret_iv TEXT,
  secret_tag TEXT,
  vault_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','invalid','revoked','expired')),
  authorized_scopes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  validated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  validation_error_code TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_user_product_credentials_gate
  ON user_product_credentials(organization_id, user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS documentation_feature_flags (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_environments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_roles_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  modified_by TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS documentation_schemas (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('openapi-json','openapi-yaml','postman-json','theneo','graphql-sdl')),
  product_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
  active_version_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, slug, environment)
);

CREATE TABLE IF NOT EXISTS documentation_schema_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  schema_id TEXT NOT NULL REFERENCES documentation_schemas(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATING','VALID','INVALID','PENDING_REVIEW','APPROVED','REJECTED','SCHEDULED','PUBLISHING','PUBLISHED','FAILED','ROLLED_BACK','ARCHIVED')),
  validation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  diff_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  breaking_count INTEGER NOT NULL DEFAULT 0,
  author_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  approver_user_id TEXT REFERENCES documentation_users(id),
  review_reason TEXT,
  published_at TIMESTAMPTZ,
  rollback_of_version_id TEXT REFERENCES documentation_schema_versions(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, schema_id, version_number),
  UNIQUE (organization_id, schema_id, source_hash)
);
CREATE INDEX IF NOT EXISTS idx_documentation_schema_versions_state
  ON documentation_schema_versions(organization_id, status, updated_at DESC);
ALTER TABLE documentation_schemas
  ADD CONSTRAINT fk_documentation_schemas_active_version
  FOREIGN KEY (active_version_id) REFERENCES documentation_schema_versions(id);

CREATE TABLE IF NOT EXISTS documentation_publications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  schema_id TEXT NOT NULL REFERENCES documentation_schemas(id) ON DELETE CASCADE,
  schema_version_id TEXT NOT NULL REFERENCES documentation_schema_versions(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  idempotency_key TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  error_code TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS documentation_user_provisioning (
  user_id TEXT PRIMARY KEY REFERENCES documentation_users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  allowed_environments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  feature_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_setup_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_product_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_user_provisioning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_product_credentials_org_policy ON user_product_credentials;
CREATE POLICY user_product_credentials_org_policy ON user_product_credentials
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
DROP POLICY IF EXISTS documentation_feature_flags_org_policy ON documentation_feature_flags;
CREATE POLICY documentation_feature_flags_org_policy ON documentation_feature_flags
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
DROP POLICY IF EXISTS documentation_schemas_org_policy ON documentation_schemas;
CREATE POLICY documentation_schemas_org_policy ON documentation_schemas
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
DROP POLICY IF EXISTS documentation_schema_versions_org_policy ON documentation_schema_versions;
CREATE POLICY documentation_schema_versions_org_policy ON documentation_schema_versions
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
DROP POLICY IF EXISTS documentation_publications_org_policy ON documentation_publications;
CREATE POLICY documentation_publications_org_policy ON documentation_publications
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
DROP POLICY IF EXISTS documentation_user_provisioning_org_policy ON documentation_user_provisioning;
CREATE POLICY documentation_user_provisioning_org_policy ON documentation_user_provisioning
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
`;
