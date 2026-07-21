/**
 * Migration 010 — authoritative query analytics (logical queries, attempts, outbox)
 * plus encrypted unanswered PII columns. Additive; safe for SQLite tests + Postgres RLS.
 */

export const SQLITE_QUERY_ANALYTICS_AUTHORITATIVE_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS query_logical_queries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logical_query_id TEXT NOT NULL,
  user_id TEXT REFERENCES documentation_users(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  turn_id TEXT REFERENCES agent_turns(id) ON DELETE SET NULL,
  hostname TEXT NOT NULL,
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  collection_id TEXT,
  intent TEXT,
  terminal_outcome TEXT,
  reason_code TEXT,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','processing','streaming','completed','cancelled')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, logical_query_id)
);
CREATE INDEX IF NOT EXISTS idx_query_logical_queries_org_started
  ON query_logical_queries(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logical_queries_org_product_started
  ON query_logical_queries(organization_id, product_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logical_queries_org_outcome
  ON query_logical_queries(organization_id, terminal_outcome, started_at DESC);

CREATE TABLE IF NOT EXISTS query_attempts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logical_query_row_id TEXT NOT NULL REFERENCES query_logical_queries(id) ON DELETE CASCADE,
  logical_query_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','streaming','completed','cancelled','provider_error','system_error')),
  outcome TEXT,
  reason_code TEXT,
  retrieval_result_count INTEGER,
  citation_count INTEGER,
  request_id TEXT,
  trace_id TEXT,
  model_version TEXT,
  prompt_version TEXT,
  index_version TEXT,
  started_at TEXT NOT NULL,
  first_token_at TEXT,
  completed_at TEXT,
  latency_ms INTEGER,
  first_token_latency_ms INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, attempt_id)
);
CREATE INDEX IF NOT EXISTS idx_query_attempts_org_logical
  ON query_attempts(organization_id, logical_query_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_attempts_org_started
  ON query_attempts(organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS analytics_outbox (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','dead_letter')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  next_retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_outbox_status_retry
  ON analytics_outbox(status, next_retry_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_query_analytics_events_org_attempt
  ON query_analytics_events(organization_id, attempt_id);

ALTER TABLE unanswered_query_reviews ADD COLUMN query_ciphertext TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN query_iv TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN query_tag TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN query_fingerprint TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN sanitized_topic TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN ip_ciphertext TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN ip_iv TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN ip_tag TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN customer_name_snapshot TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN logical_query_id TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN resolved_by_logical_query_id TEXT;
`;

export const POSTGRES_QUERY_ANALYTICS_AUTHORITATIVE_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS query_logical_queries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logical_query_id TEXT NOT NULL,
  user_id TEXT REFERENCES documentation_users(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  turn_id TEXT REFERENCES agent_turns(id) ON DELETE SET NULL,
  hostname TEXT NOT NULL,
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  collection_id TEXT,
  intent TEXT,
  terminal_outcome TEXT,
  reason_code TEXT,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','processing','streaming','completed','cancelled')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, logical_query_id)
);
CREATE INDEX IF NOT EXISTS idx_query_logical_queries_org_started
  ON query_logical_queries(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logical_queries_org_product_started
  ON query_logical_queries(organization_id, product_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logical_queries_org_outcome
  ON query_logical_queries(organization_id, terminal_outcome, started_at DESC);
ALTER TABLE query_logical_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_logical_queries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS query_logical_queries_tenant ON query_logical_queries;
CREATE POLICY query_logical_queries_tenant ON query_logical_queries
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text);

CREATE TABLE IF NOT EXISTS query_attempts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logical_query_row_id TEXT NOT NULL REFERENCES query_logical_queries(id) ON DELETE CASCADE,
  logical_query_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','streaming','completed','cancelled','provider_error','system_error')),
  outcome TEXT,
  reason_code TEXT,
  retrieval_result_count INTEGER,
  citation_count INTEGER,
  request_id TEXT,
  trace_id TEXT,
  model_version TEXT,
  prompt_version TEXT,
  index_version TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  first_token_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  latency_ms INTEGER,
  first_token_latency_ms INTEGER,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, attempt_id)
);
CREATE INDEX IF NOT EXISTS idx_query_attempts_org_logical
  ON query_attempts(organization_id, logical_query_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_attempts_org_started
  ON query_attempts(organization_id, started_at DESC);
ALTER TABLE query_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS query_attempts_tenant ON query_attempts;
CREATE POLICY query_attempts_tenant ON query_attempts
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text);

CREATE TABLE IF NOT EXISTS analytics_outbox (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','dead_letter')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_outbox_status_retry
  ON analytics_outbox(status, next_retry_at);
ALTER TABLE analytics_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_outbox_tenant ON analytics_outbox;
CREATE POLICY analytics_outbox_tenant ON analytics_outbox
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text);

CREATE UNIQUE INDEX IF NOT EXISTS idx_query_analytics_events_org_attempt
  ON query_analytics_events(organization_id, attempt_id);

ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS query_ciphertext TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS query_iv TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS query_tag TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS query_fingerprint TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS sanitized_topic TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS ip_ciphertext TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS ip_iv TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS ip_tag TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS logical_query_id TEXT;
ALTER TABLE unanswered_query_reviews ADD COLUMN IF NOT EXISTS resolved_by_logical_query_id TEXT;
`;
