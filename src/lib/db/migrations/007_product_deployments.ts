export const SQLITE_PRODUCT_DEPLOYMENTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS product_deployments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL CHECK (product_id IN ('ctix','cftr','csap','orchestrate')),
  postman_collection_id TEXT NOT NULL,
  postman_collection_version TEXT,
  vercel_team_id TEXT NOT NULL,
  vercel_project_id TEXT NOT NULL,
  vercel_project_name TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development','preview','staging','production')),
  primary_domain TEXT,
  additional_domains_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured','configuring','ready','deploying','failed','disabled')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  updated_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, product_id, environment)
);
CREATE INDEX IF NOT EXISTS idx_product_deployments_org
  ON product_deployments(organization_id, product_id);

CREATE TABLE IF NOT EXISTS domain_automation_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL REFERENCES product_deployments(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  workflow_state TEXT NOT NULL DEFAULT 'not_configured',
  vercel_domain_id TEXT,
  dns_requirements_json TEXT NOT NULL DEFAULT '[]',
  last_dns_check_json TEXT,
  last_dns_check_at TEXT,
  dns_retry_count INTEGER NOT NULL DEFAULT 0,
  tls_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (tls_status IN ('pending','active','failed','expired')),
  last_provider_error TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_domain_automation_deployment
  ON domain_automation_records(deployment_id);

CREATE TABLE IF NOT EXISTS deployment_audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id TEXT REFERENCES product_deployments(id) ON DELETE SET NULL,
  domain TEXT,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES documentation_users(id) ON DELETE SET NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deployment_audit_org_created
  ON deployment_audit_events(organization_id, created_at DESC);
`;

export const POSTGRES_PRODUCT_DEPLOYMENTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS product_deployments (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL CHECK (product_id IN ('ctix','cftr','csap','orchestrate')),
  postman_collection_id TEXT NOT NULL,
  postman_collection_version TEXT,
  vercel_team_id TEXT NOT NULL,
  vercel_project_id TEXT NOT NULL,
  vercel_project_name TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('development','preview','staging','production')),
  primary_domain TEXT,
  additional_domains_json JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'not_configured',
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id UUID NOT NULL REFERENCES documentation_users(id),
  updated_by_user_id UUID NOT NULL REFERENCES documentation_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, product_id, environment)
);
CREATE INDEX IF NOT EXISTS idx_product_deployments_org
  ON product_deployments(organization_id, product_id);

CREATE TABLE IF NOT EXISTS domain_automation_records (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id UUID NOT NULL REFERENCES product_deployments(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  workflow_state TEXT NOT NULL DEFAULT 'not_configured',
  vercel_domain_id TEXT,
  dns_requirements_json JSONB NOT NULL DEFAULT '[]',
  last_dns_check_json JSONB,
  last_dns_check_at TIMESTAMPTZ,
  dns_retry_count INTEGER NOT NULL DEFAULT 0,
  tls_status TEXT NOT NULL DEFAULT 'pending',
  last_provider_error TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_domain_automation_deployment
  ON domain_automation_records(deployment_id);

CREATE TABLE IF NOT EXISTS deployment_audit_events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id UUID REFERENCES product_deployments(id) ON DELETE SET NULL,
  domain TEXT,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES documentation_users(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deployment_audit_org_created
  ON deployment_audit_events(organization_id, created_at DESC);

ALTER TABLE product_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_automation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_audit_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY product_deployments_org ON product_deployments
    USING (organization_id = current_setting('app.organization_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY domain_automation_records_org ON domain_automation_records
    USING (organization_id = current_setting('app.organization_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY deployment_audit_events_org ON deployment_audit_events
    USING (organization_id = current_setting('app.organization_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;
