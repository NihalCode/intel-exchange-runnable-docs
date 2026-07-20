/**
 * Migration 009 — FORCE ROW LEVEL SECURITY on tenant tables.
 * Table owners previously bypassed RLS; FORCE closes that gap.
 */

export const SQLITE_FORCE_RLS_MIGRATION_SQL = `
-- SQLite has no RLS; no-op placeholder for ledger parity.
SELECT 1;
`;

export const POSTGRES_FORCE_RLS_MIGRATION_SQL = `
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization_memberships',
    'control_plane_resources',
    'control_plane_config_versions',
    'change_requests',
    'change_request_approvals',
    'api_credential_metadata',
    'enterprise_audit_events',
    'idempotency_keys',
    'background_jobs',
    'organization_security_settings',
    'user_product_credentials',
    'documentation_feature_flags',
    'documentation_schemas',
    'documentation_schema_versions',
    'documentation_publications',
    'documentation_user_provisioning',
    'agent_conversations',
    'agent_turns',
    'agent_messages',
    'domain_collection_mappings',
    'query_analytics_events',
    'unanswered_query_reviews',
    'product_deployments',
    'domain_automation_records',
    'deployment_audit_events'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END $$;
`;
