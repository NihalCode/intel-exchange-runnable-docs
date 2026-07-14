export const SQLITE_AGENT_CONVERSATIONS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_owner
  ON agent_conversations(organization_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','cancelled','failed')),
  request_id TEXT,
  idempotency_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation
  ON agent_turns(organization_id, user_id, conversation_id, created_at);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  type TEXT NOT NULL CHECK (type IN ('user_message','assistant_status','assistant_final','recoverable_error','terminal_error')),
  sequence INTEGER NOT NULL,
  content_text TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (turn_id, sequence)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_messages_one_final_per_turn
  ON agent_messages(turn_id) WHERE type = 'assistant_final';
CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation
  ON agent_messages(organization_id, conversation_id, created_at, sequence);
`;

export const POSTGRES_AGENT_CONVERSATIONS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_owner
  ON agent_conversations(organization_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES documentation_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','cancelled','failed')),
  request_id TEXT,
  idempotency_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation
  ON agent_turns(organization_id, user_id, conversation_id, created_at);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  type TEXT NOT NULL CHECK (type IN ('user_message','assistant_status','assistant_final','recoverable_error','terminal_error')),
  sequence INTEGER NOT NULL,
  content_text TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (turn_id, sequence)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_messages_one_final_per_turn
  ON agent_messages(turn_id) WHERE type = 'assistant_final';
CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation
  ON agent_messages(organization_id, conversation_id, created_at, sequence);

ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_conversations_org_policy ON agent_conversations;
CREATE POLICY agent_conversations_org_policy ON agent_conversations
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), ''));
DROP POLICY IF EXISTS agent_turns_org_policy ON agent_turns;
CREATE POLICY agent_turns_org_policy ON agent_turns
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), ''));
DROP POLICY IF EXISTS agent_messages_org_policy ON agent_messages;
CREATE POLICY agent_messages_org_policy ON agent_messages
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), ''));
`;
