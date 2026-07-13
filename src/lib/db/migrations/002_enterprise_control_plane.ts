export const SQLITE_ENTERPRISE_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  auth0_organization_id TEXT UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  permissions_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user_status
  ON organization_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_org_role
  ON organization_memberships(organization_id, role);

CREATE TABLE IF NOT EXISTS control_plane_resources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  name TEXT NOT NULL,
  environment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  active_config_version INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, resource_type, environment, name)
);
CREATE INDEX IF NOT EXISTS idx_cp_resources_org_type_env
  ON control_plane_resources(organization_id, resource_type, environment);

CREATE TABLE IF NOT EXISTS control_plane_config_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES control_plane_resources(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  sanitized_diff_json TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, resource_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_cp_config_versions_resource
  ON control_plane_config_versions(organization_id, resource_id, version_number DESC);

CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES control_plane_resources(id) ON DELETE CASCADE,
  target_config_version_id TEXT NOT NULL REFERENCES control_plane_config_versions(id),
  state TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  approved_by_user_id TEXT REFERENCES documentation_users(id),
  scheduled_for TEXT,
  activated_at TEXT,
  rollback_of_change_request_id TEXT REFERENCES change_requests(id),
  idempotency_key TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_change_requests_org_state
  ON change_requests(organization_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_requests_resource
  ON change_requests(organization_id, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS change_request_approvals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  change_request_id TEXT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  decision TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, change_request_id, approver_user_id)
);
CREATE INDEX IF NOT EXISTS idx_change_approvals_request
  ON change_request_approvals(organization_id, change_request_id);

CREATE TABLE IF NOT EXISTS api_credential_metadata (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  environment TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  vault_ref TEXT,
  last4 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  revoked_at TEXT,
  rotated_at TEXT,
  rotated_from_id TEXT REFERENCES api_credential_metadata(id),
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, environment, name)
);
CREATE INDEX IF NOT EXISTS idx_api_credentials_org_env_status
  ON api_credential_metadata(organization_id, environment, status);

CREATE TABLE IF NOT EXISTS enterprise_audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES documentation_users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  request_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enterprise_audit_org_created
  ON enterprise_audit_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enterprise_audit_correlation
  ON enterprise_audit_events(organization_id, correlation_id);
CREATE TRIGGER IF NOT EXISTS enterprise_audit_no_update
BEFORE UPDATE ON enterprise_audit_events
BEGIN SELECT RAISE(ABORT, 'enterprise audit events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS enterprise_audit_no_delete
BEFORE DELETE ON enterprise_audit_events
BEGIN SELECT RAISE(ABORT, 'enterprise audit events are immutable'); END;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_value TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  resource_id TEXT,
  response_json TEXT,
  status_code INTEGER,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, operation, key_value)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry
  ON idempotency_keys(organization_id, expires_at);

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  last_error TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_background_jobs_claim
  ON background_jobs(organization_id, status, run_after);
`;

export const POSTGRES_ENTERPRISE_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  auth0_organization_id TEXT UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
  permissions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user_status
  ON organization_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_org_role
  ON organization_memberships(organization_id, role);

CREATE TABLE IF NOT EXISTS control_plane_resources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  name TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  status TEXT NOT NULL DEFAULT 'active',
  active_config_version INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, resource_type, environment, name)
);
CREATE INDEX IF NOT EXISTS idx_cp_resources_org_type_env
  ON control_plane_resources(organization_id, resource_type, environment);

CREATE TABLE IF NOT EXISTS control_plane_config_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES control_plane_resources(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  config_json JSONB NOT NULL,
  sanitized_diff_json JSONB,
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, resource_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_cp_config_versions_resource
  ON control_plane_config_versions(organization_id, resource_id, version_number DESC);

CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES control_plane_resources(id) ON DELETE CASCADE,
  target_config_version_id TEXT NOT NULL REFERENCES control_plane_config_versions(id),
  state TEXT NOT NULL CHECK (state IN ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','SCHEDULED','DEPLOYING','ACTIVE','ROLLED_BACK')),
  requested_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  approved_by_user_id TEXT REFERENCES documentation_users(id),
  scheduled_for TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  rollback_of_change_request_id TEXT REFERENCES change_requests(id),
  idempotency_key TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_change_requests_org_state
  ON change_requests(organization_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_requests_resource
  ON change_requests(organization_id, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS change_request_approvals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  change_request_id TEXT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, change_request_id, approver_user_id)
);
CREATE INDEX IF NOT EXISTS idx_change_approvals_request
  ON change_request_approvals(organization_id, change_request_id);

CREATE TABLE IF NOT EXISTS api_credential_metadata (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  key_hash TEXT NOT NULL UNIQUE,
  vault_ref TEXT,
  last4 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired', 'rotated')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  rotated_from_id TEXT REFERENCES api_credential_metadata(id),
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, environment, name)
);
CREATE INDEX IF NOT EXISTS idx_api_credentials_org_env_status
  ON api_credential_metadata(organization_id, environment, status);

CREATE TABLE IF NOT EXISTS enterprise_audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES documentation_users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  request_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enterprise_audit_org_created
  ON enterprise_audit_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enterprise_audit_correlation
  ON enterprise_audit_events(organization_id, correlation_id);

CREATE OR REPLACE FUNCTION prevent_enterprise_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'enterprise audit events are immutable'; END;
$$;
DROP TRIGGER IF EXISTS enterprise_audit_no_update ON enterprise_audit_events;
CREATE TRIGGER enterprise_audit_no_update
BEFORE UPDATE OR DELETE ON enterprise_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_enterprise_audit_mutation();

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_value TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  resource_id TEXT,
  response_json JSONB,
  status_code INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, operation, key_value)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry
  ON idempotency_keys(organization_id, expires_at);

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_background_jobs_claim
  ON background_jobs(organization_id, status, run_after);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization_memberships', 'control_plane_resources',
    'control_plane_config_versions', 'change_requests',
    'change_request_approvals', 'api_credential_metadata',
    'enterprise_audit_events', 'idempotency_keys', 'background_jobs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS organization_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY organization_isolation ON %I USING (
        organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')
      ) WITH CHECK (
        organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')
      )',
      table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS membership_identity_isolation ON organization_memberships;
CREATE POLICY membership_identity_isolation ON organization_memberships
  AS RESTRICTIVE
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')
    AND (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      OR NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
    )
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')
  );
`;
