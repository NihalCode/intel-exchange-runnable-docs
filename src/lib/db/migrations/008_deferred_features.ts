export const SQLITE_DEFERRED_FEATURES_MIGRATION_SQL = `
ALTER TABLE product_deployments ADD COLUMN control_plane_resource_id TEXT
  REFERENCES control_plane_resources(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS deployment_domain_change_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL REFERENCES product_deployments(id) ON DELETE CASCADE,
  change_request_id TEXT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('add','remove','verify')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','expired')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, change_request_id)
);
CREATE INDEX IF NOT EXISTS idx_deployment_domain_change_deployment
  ON deployment_domain_change_requests(deployment_id, status);

CREATE TABLE IF NOT EXISTS unanswered_query_reviews_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  analytics_event_id TEXT NOT NULL REFERENCES query_analytics_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN (
      'NEW','REVIEWED','DOCUMENTATION_GAP','RETRIEVAL_GAP','PRODUCT_BUG',
      'CONNECTOR_ISSUE','ACCESS_ISSUE','FIXED','ACCEPTED_LIMITATION'
    )),
  category TEXT,
  owner_user_id TEXT REFERENCES documentation_users(id) ON DELETE SET NULL,
  internal_note TEXT,
  resolution_reference TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, analytics_event_id)
);
INSERT INTO unanswered_query_reviews_v2 (
  id, organization_id, analytics_event_id, status, category, owner_user_id,
  internal_note, resolution_reference, version, created_at, updated_at
)
SELECT
  id, organization_id, analytics_event_id,
  CASE status
    WHEN 'open' THEN 'NEW'
    WHEN 'triaged' THEN 'REVIEWED'
    WHEN 'resolved' THEN 'FIXED'
    WHEN 'dismissed' THEN 'ACCEPTED_LIMITATION'
    ELSE 'NEW'
  END,
  category, owner_user_id, internal_note, resolution_reference, version, created_at, updated_at
FROM unanswered_query_reviews;
DROP TABLE unanswered_query_reviews;
ALTER TABLE unanswered_query_reviews_v2 RENAME TO unanswered_query_reviews;
CREATE INDEX IF NOT EXISTS idx_unanswered_query_reviews_org_status
  ON unanswered_query_reviews(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_unanswered_query_reviews_event
  ON unanswered_query_reviews(organization_id, analytics_event_id);
`;

export const POSTGRES_DEFERRED_FEATURES_MIGRATION_SQL = `
ALTER TABLE product_deployments
  ADD COLUMN IF NOT EXISTS control_plane_resource_id UUID
  REFERENCES control_plane_resources(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS deployment_domain_change_requests (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id UUID NOT NULL REFERENCES product_deployments(id) ON DELETE CASCADE,
  change_request_id UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('add','remove','verify')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','expired')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, change_request_id)
);
CREATE INDEX IF NOT EXISTS idx_deployment_domain_change_deployment
  ON deployment_domain_change_requests(deployment_id, status);

ALTER TABLE unanswered_query_reviews DROP CONSTRAINT IF EXISTS unanswered_query_reviews_status_check;
UPDATE unanswered_query_reviews SET status = CASE status
  WHEN 'open' THEN 'NEW'
  WHEN 'triaged' THEN 'REVIEWED'
  WHEN 'resolved' THEN 'FIXED'
  WHEN 'dismissed' THEN 'ACCEPTED_LIMITATION'
  ELSE status
END;
ALTER TABLE unanswered_query_reviews
  ADD CONSTRAINT unanswered_query_reviews_status_check CHECK (status IN (
    'NEW','REVIEWED','DOCUMENTATION_GAP','RETRIEVAL_GAP','PRODUCT_BUG',
    'CONNECTOR_ISSUE','ACCESS_ISSUE','FIXED','ACCEPTED_LIMITATION'
  ));
ALTER TABLE unanswered_query_reviews ALTER COLUMN status SET DEFAULT 'NEW';
`;
