/**
 * Migration 011 — chat feedback, unanswered weekly snapshots, and any
 * unanswered_query_reviews column gaps left from 010. Additive; SQLite + Postgres RLS.
 */

export const SQLITE_FEEDBACK_UNANSWERED_WEEKLY_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS chat_feedback (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  turn_id TEXT REFERENCES agent_turns(id) ON DELETE SET NULL,
  logical_query_id TEXT,
  message_id TEXT NOT NULL,
  hostname TEXT,
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  rating TEXT NOT NULL CHECK (rating IN ('up','down')),
  comment_ciphertext TEXT,
  comment_iv TEXT,
  comment_tag TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_org_created
  ON chat_feedback(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_org_logical
  ON chat_feedback(organization_id, logical_query_id);

CREATE TABLE IF NOT EXISTS unanswered_weekly_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  hostname TEXT,
  outcome TEXT,
  status TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  fixed_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, week_start, product_id, hostname, outcome, status)
);
CREATE INDEX IF NOT EXISTS idx_unanswered_weekly_org_week
  ON unanswered_weekly_snapshots(organization_id, week_start DESC);
`;

export const POSTGRES_FEEDBACK_UNANSWERED_WEEKLY_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS chat_feedback (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  turn_id TEXT REFERENCES agent_turns(id) ON DELETE SET NULL,
  logical_query_id TEXT,
  message_id TEXT NOT NULL,
  hostname TEXT,
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  rating TEXT NOT NULL CHECK (rating IN ('up','down')),
  comment_ciphertext TEXT,
  comment_iv TEXT,
  comment_tag TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_org_created
  ON chat_feedback(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_org_logical
  ON chat_feedback(organization_id, logical_query_id);
ALTER TABLE chat_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_feedback_tenant ON chat_feedback;
CREATE POLICY chat_feedback_tenant ON chat_feedback
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text);

CREATE TABLE IF NOT EXISTS unanswered_weekly_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  product_id TEXT CHECK (product_id IN ('ctix','cftr','csap','orchestrate') OR product_id IS NULL),
  hostname TEXT,
  outcome TEXT,
  status TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  fixed_count INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, week_start, product_id, hostname, outcome, status)
);
CREATE INDEX IF NOT EXISTS idx_unanswered_weekly_org_week
  ON unanswered_weekly_snapshots(organization_id, week_start DESC);
ALTER TABLE unanswered_weekly_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE unanswered_weekly_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unanswered_weekly_snapshots_tenant ON unanswered_weekly_snapshots;
CREATE POLICY unanswered_weekly_snapshots_tenant ON unanswered_weekly_snapshots
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::text);

-- Idempotent column ensure for environments that applied an older 010 without PII columns.
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
