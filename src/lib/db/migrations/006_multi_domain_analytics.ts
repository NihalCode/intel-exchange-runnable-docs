export const SQLITE_MULTI_DOMAIN_ANALYTICS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS domain_collection_mappings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('product','admin','auth')),
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  collection_id TEXT,
  environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
  is_primary INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','failed','disabled')),
  tls_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (tls_status IN ('pending','active','failed','expired')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  updated_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, hostname)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_collection_mappings_active_hostname
  ON domain_collection_mappings(hostname)
  WHERE enabled = 1 AND verification_status = 'verified';
CREATE INDEX IF NOT EXISTS idx_domain_collection_mappings_org_hostname
  ON domain_collection_mappings(organization_id, hostname);

CREATE TABLE IF NOT EXISTS query_analytics_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES documentation_users(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  turn_id TEXT REFERENCES agent_turns(id) ON DELETE SET NULL,
  logical_query_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  collection_id TEXT,
  intent TEXT,
  outcome TEXT NOT NULL,
  retrieval_result_count INTEGER,
  citation_count INTEGER,
  latency_ms INTEGER,
  request_id TEXT,
  trace_id TEXT,
  model_version TEXT,
  prompt_version TEXT,
  index_version TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_org_created
  ON query_analytics_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_org_product_created
  ON query_analytics_events(organization_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_org_outcome_created
  ON query_analytics_events(organization_id, outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_logical_query
  ON query_analytics_events(organization_id, logical_query_id);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_turn
  ON query_analytics_events(organization_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_hostname
  ON query_analytics_events(organization_id, hostname);

CREATE TABLE IF NOT EXISTS unanswered_query_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  analytics_event_id TEXT NOT NULL REFERENCES query_analytics_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','triaged','resolved','dismissed')),
  category TEXT,
  owner_user_id TEXT REFERENCES documentation_users(id) ON DELETE SET NULL,
  internal_note TEXT,
  resolution_reference TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, analytics_event_id)
);
CREATE INDEX IF NOT EXISTS idx_unanswered_query_reviews_org_status
  ON unanswered_query_reviews(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_unanswered_query_reviews_event
  ON unanswered_query_reviews(organization_id, analytics_event_id);

CREATE TABLE IF NOT EXISTS auth_return_targets (
  id TEXT PRIMARY KEY,
  target_hostname TEXT NOT NULL,
  return_path TEXT NOT NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_return_targets_expires
  ON auth_return_targets(expires_at);
`;

export const POSTGRES_MULTI_DOMAIN_ANALYTICS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS domain_collection_mappings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('product','admin','auth')),
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  collection_id TEXT,
  environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','failed','disabled')),
  tls_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (tls_status IN ('pending','active','failed','expired')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  updated_by_user_id TEXT NOT NULL REFERENCES documentation_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, hostname)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_collection_mappings_active_hostname
  ON domain_collection_mappings(hostname)
  WHERE enabled = TRUE AND verification_status = 'verified';
CREATE INDEX IF NOT EXISTS idx_domain_collection_mappings_org_hostname
  ON domain_collection_mappings(organization_id, hostname);

CREATE TABLE IF NOT EXISTS query_analytics_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES documentation_users(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  turn_id TEXT REFERENCES agent_turns(id) ON DELETE SET NULL,
  logical_query_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  collection_id TEXT,
  intent TEXT,
  outcome TEXT NOT NULL,
  retrieval_result_count INTEGER,
  citation_count INTEGER,
  latency_ms INTEGER,
  request_id TEXT,
  trace_id TEXT,
  model_version TEXT,
  prompt_version TEXT,
  index_version TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_org_created
  ON query_analytics_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_org_product_created
  ON query_analytics_events(organization_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_org_outcome_created
  ON query_analytics_events(organization_id, outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_logical_query
  ON query_analytics_events(organization_id, logical_query_id);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_turn
  ON query_analytics_events(organization_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_query_analytics_events_hostname
  ON query_analytics_events(organization_id, hostname);

CREATE TABLE IF NOT EXISTS unanswered_query_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  analytics_event_id TEXT NOT NULL REFERENCES query_analytics_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','triaged','resolved','dismissed')),
  category TEXT,
  owner_user_id TEXT REFERENCES documentation_users(id) ON DELETE SET NULL,
  internal_note TEXT,
  resolution_reference TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, analytics_event_id)
);
CREATE INDEX IF NOT EXISTS idx_unanswered_query_reviews_org_status
  ON unanswered_query_reviews(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_unanswered_query_reviews_event
  ON unanswered_query_reviews(organization_id, analytics_event_id);

CREATE TABLE IF NOT EXISTS auth_return_targets (
  id TEXT PRIMARY KEY,
  target_hostname TEXT NOT NULL,
  return_path TEXT NOT NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_return_targets_expires
  ON auth_return_targets(expires_at);

ALTER TABLE domain_collection_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE unanswered_query_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domain_collection_mappings_org_policy ON domain_collection_mappings;
CREATE POLICY domain_collection_mappings_org_policy ON domain_collection_mappings
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
DROP POLICY IF EXISTS query_analytics_events_org_policy ON query_analytics_events;
CREATE POLICY query_analytics_events_org_policy ON query_analytics_events
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
DROP POLICY IF EXISTS unanswered_query_reviews_org_policy ON unanswered_query_reviews;
CREATE POLICY unanswered_query_reviews_org_policy ON unanswered_query_reviews
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));
`;
