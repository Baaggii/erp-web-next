BEGIN;

-- PostgreSQL migration for multi-tenant collaboration + security.
-- Prerequisites:
--   1) PostgreSQL 14+
--   2) Application sets the following settings per request/session:
--        SET app.user_id = '<uuid>';
--        SET app.company_id = '<uuid>';

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- Helper functions for audit + RLS context
-- ============================================================================
CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- Core IAM + tenancy
-- ============================================================================
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code text NOT NULL UNIQUE,
  company_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT companies_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT users_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  role_name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT roles_company_role_key_uk UNIQUE (company_id, role_key),
  CONSTRAINT roles_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  permission_name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT permissions_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT role_permissions_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT memberships_company_user_uk UNIQUE (company_id, user_id),
  CONSTRAINT memberships_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS membership_roles (
  membership_id uuid NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  PRIMARY KEY (membership_id, role_id),
  CONSTRAINT membership_roles_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

-- ============================================================================
-- Tenant-linked entities (examples for message_links)
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);

CREATE TABLE IF NOT EXISTS business_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);

CREATE TABLE IF NOT EXISTS business_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);

-- ============================================================================
-- Conversation domain
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text,
  conversation_type text NOT NULL DEFAULT 'group' CHECK (conversation_type IN ('dm', 'group', 'announcement')),
  last_message_at timestamptz,
  archived_at timestamptz,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT conversations_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_type text NOT NULL DEFAULT 'member' CHECK (participant_type IN ('member', 'moderator', 'owner')),
  muted_until timestamptz,
  last_read_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT conversation_participants_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  root_message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  reply_depth int NOT NULL DEFAULT 0 CHECK (reply_depth BETWEEN 0 AND 3),
  body_text text,
  body_ciphertext bytea,
  body_encrypted boolean NOT NULL DEFAULT false,
  message_kind text NOT NULL DEFAULT 'text' CHECK (message_kind IN ('text', 'system', 'file')),
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT messages_content_ck CHECK (
    body_encrypted = false OR body_ciphertext IS NOT NULL
  ),
  CONSTRAINT messages_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS message_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  link_type text NOT NULL CHECK (link_type IN ('transaction', 'plan', 'topic')),
  transaction_id uuid REFERENCES business_transactions(id) ON DELETE RESTRICT,
  plan_id uuid REFERENCES business_plans(id) ON DELETE RESTRICT,
  topic_id uuid REFERENCES business_topics(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT message_links_polymorphic_ck CHECK (
    (link_type = 'transaction' AND transaction_id IS NOT NULL AND plan_id IS NULL AND topic_id IS NULL)
    OR (link_type = 'plan' AND plan_id IS NOT NULL AND transaction_id IS NULL AND topic_id IS NULL)
    OR (link_type = 'topic' AND topic_id IS NOT NULL AND transaction_id IS NULL AND plan_id IS NULL)
  ),
  CONSTRAINT message_links_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS read_receipts (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT read_receipts_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  content_sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT attachments_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS user_presence (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('offline', 'online', 'away', 'dnd')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  PRIMARY KEY (company_id, user_id),
  CONSTRAINT user_presence_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempts int NOT NULL DEFAULT 0,
  not_before timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT notification_queue_soft_delete_actor_ck CHECK (
    deleted_at IS NULL OR deleted_by IS NOT NULL
  )
);

ALTER TABLE conversation_participants
  ADD CONSTRAINT conversation_participants_last_read_message_fk
  FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE SET NULL;

-- ============================================================================
-- Tenant consistency checks
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_same_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_company uuid;
  parent_company uuid;
BEGIN
  IF TG_TABLE_NAME = 'conversation_participants' THEN
    SELECT c.company_id INTO conversation_company
    FROM conversations c
    WHERE c.id = NEW.conversation_id;

    IF conversation_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'conversation_participants.company_id must match conversations.company_id';
    END IF;
  ELSIF TG_TABLE_NAME = 'messages' THEN
    SELECT c.company_id INTO conversation_company
    FROM conversations c
    WHERE c.id = NEW.conversation_id;

    IF conversation_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'messages.company_id must match conversations.company_id';
    END IF;

    IF NEW.parent_message_id IS NOT NULL THEN
      SELECT m.company_id INTO parent_company
      FROM messages m
      WHERE m.id = NEW.parent_message_id;

      IF parent_company IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'messages parent must belong to same company';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'message_links' THEN
    SELECT m.company_id INTO parent_company
    FROM messages m
    WHERE m.id = NEW.message_id;

    IF parent_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'message_links.company_id must match messages.company_id';
    END IF;
  ELSIF TG_TABLE_NAME = 'read_receipts' THEN
    SELECT m.company_id INTO parent_company
    FROM messages m
    WHERE m.id = NEW.message_id;

    IF parent_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'read_receipts.company_id must match messages.company_id';
    END IF;
  ELSIF TG_TABLE_NAME = 'attachments' THEN
    SELECT m.company_id INTO parent_company
    FROM messages m
    WHERE m.id = NEW.message_id;

    IF parent_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'attachments.company_id must match messages.company_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER conversation_participants_company_guard
BEFORE INSERT OR UPDATE ON conversation_participants
FOR EACH ROW EXECUTE FUNCTION enforce_same_company_id();

CREATE TRIGGER messages_company_guard
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION enforce_same_company_id();

CREATE TRIGGER message_links_company_guard
BEFORE INSERT OR UPDATE ON message_links
FOR EACH ROW EXECUTE FUNCTION enforce_same_company_id();

CREATE TRIGGER read_receipts_company_guard
BEFORE INSERT OR UPDATE ON read_receipts
FOR EACH ROW EXECUTE FUNCTION enforce_same_company_id();

CREATE TRIGGER attachments_company_guard
BEFORE INSERT OR UPDATE ON attachments
FOR EACH ROW EXECUTE FUNCTION enforce_same_company_id();

-- Max reply depth enforcement via trigger + CHECK(reply_depth <= 3).
CREATE OR REPLACE FUNCTION enforce_message_reply_depth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_depth int;
  parent_root uuid;
BEGIN
  IF NEW.parent_message_id IS NULL THEN
    NEW.reply_depth = 0;
    NEW.root_message_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT reply_depth, COALESCE(root_message_id, id)
    INTO parent_depth, parent_root
  FROM messages
  WHERE id = NEW.parent_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent message % not found', NEW.parent_message_id;
  END IF;

  IF parent_depth >= 3 THEN
    RAISE EXCEPTION 'Maximum reply depth exceeded (max=3)';
  END IF;

  NEW.reply_depth = parent_depth + 1;
  NEW.root_message_id = parent_root;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_reply_depth_guard
BEFORE INSERT OR UPDATE OF parent_message_id ON messages
FOR EACH ROW EXECUTE FUNCTION enforce_message_reply_depth();

-- ============================================================================
-- Index strategy (inbox, thread expansion, unread counts, link lookup)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_memberships_company_user_active
  ON memberships (company_id, user_id)
  WHERE deleted_at IS NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_inbox
  ON conversation_participants (company_id, user_id, conversation_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_inbox_sort
  ON conversations (company_id, archived_at, last_message_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (company_id, conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_thread_lookup
  ON messages (company_id, root_message_id, reply_depth, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_read_receipts_user_message
  ON read_receipts (company_id, user_id, message_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_message_links_transaction
  ON message_links (company_id, transaction_id, message_id)
  WHERE deleted_at IS NULL AND link_type = 'transaction';

CREATE INDEX IF NOT EXISTS idx_message_links_plan
  ON message_links (company_id, plan_id, message_id)
  WHERE deleted_at IS NULL AND link_type = 'plan';

CREATE INDEX IF NOT EXISTS idx_message_links_topic
  ON message_links (company_id, topic_id, message_id)
  WHERE deleted_at IS NULL AND link_type = 'topic';

CREATE INDEX IF NOT EXISTS idx_notification_queue_dispatch
  ON notification_queue (company_id, status, not_before, created_at)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- updated_at triggers
-- ============================================================================
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER permissions_updated_at BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER role_permissions_updated_at BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER membership_roles_updated_at BEFORE UPDATE ON membership_roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER conversation_participants_updated_at BEFORE UPDATE ON conversation_participants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER message_links_updated_at BEFORE UPDATE ON message_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER read_receipts_updated_at BEFORE UPDATE ON read_receipts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER attachments_updated_at BEFORE UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_presence_updated_at BEFORE UPDATE ON user_presence FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER notification_queue_updated_at BEFORE UPDATE ON notification_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Row-level security (tenant + membership-scoped)
-- ============================================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select_if_member ON companies
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.company_id = companies.id
      AND m.user_id = app_current_user_id()
      AND m.status = 'active'
      AND m.deleted_at IS NULL
  )
);

CREATE POLICY users_select_same_company_members ON users
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM memberships self_m
    JOIN memberships target_m
      ON target_m.company_id = self_m.company_id
    WHERE self_m.user_id = app_current_user_id()
      AND self_m.status = 'active'
      AND self_m.deleted_at IS NULL
      AND target_m.user_id = users.id
      AND target_m.status = 'active'
      AND target_m.deleted_at IS NULL
  )
);

CREATE POLICY tenant_table_isolation_memberships ON memberships
USING (
  company_id = app_current_company_id()
  AND EXISTS (
    SELECT 1 FROM memberships self_m
    WHERE self_m.company_id = app_current_company_id()
      AND self_m.user_id = app_current_user_id()
      AND self_m.status = 'active'
      AND self_m.deleted_at IS NULL
  )
)
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_roles ON roles
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_permissions ON permissions
USING (deleted_at IS NULL)
WITH CHECK (true);

CREATE POLICY tenant_table_isolation_role_permissions ON role_permissions
USING (
  EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = role_permissions.role_id
      AND r.company_id = app_current_company_id()
  )
);

CREATE POLICY tenant_table_isolation_membership_roles ON membership_roles
USING (
  EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m.id = membership_roles.membership_id
      AND m.company_id = app_current_company_id()
  )
);

CREATE POLICY tenant_table_isolation_conversations ON conversations
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_conversation_participants ON conversation_participants
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_messages ON messages
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_message_links ON message_links
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_read_receipts ON read_receipts
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_attachments ON attachments
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_user_presence ON user_presence
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_notification_queue ON notification_queue
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_business_transactions ON business_transactions
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_business_plans ON business_plans
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

CREATE POLICY tenant_table_isolation_business_topics ON business_topics
USING (company_id = app_current_company_id())
WITH CHECK (company_id = app_current_company_id());

-- ============================================================================
-- Security/encryption guidance
-- ============================================================================
COMMENT ON TABLE messages IS
'TLS in transit must be terminated with TLS 1.2+ from clients to app and app to DB.\
At rest encryption should be enabled via disk/volume encryption plus PostgreSQL backups encryption.\
Optional column-level encryption can store message content in body_ciphertext (pgp_sym_encrypt or envelope encryption).\
Key rotation: keep key id in metadata, re-encrypt in batches, support decrypt-by-key-version during migration window.';

-- ============================================================================
-- Seed data (2 companies + cross-company user)
-- ============================================================================
INSERT INTO companies (id, company_code, company_name, created_by)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'ACME', 'Acme Manufacturing', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'BNY', 'Binary Logistics', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, display_name, created_by)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alex@example.com', 'Alex Admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'blair@example.com', 'Blair Builder', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'casey@example.com', 'Casey CrossTenant', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (id, company_id, user_id, status, joined_at, created_by)
VALUES
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', now(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'active', now(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'active', now(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('20000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', now(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('20000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'active', now(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (company_id, user_id) DO NOTHING;

-- Minimal roles + permissions
INSERT INTO roles (id, company_id, role_key, role_name, created_by)
VALUES
  ('31111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'admin', 'Admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('32222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'admin', 'Admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (company_id, role_key) DO NOTHING;

INSERT INTO permissions (id, permission_key, permission_name, created_by)
VALUES
  ('41111111-1111-1111-1111-111111111111', 'conversation.read', 'Read conversations', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('42222222-2222-2222-2222-222222222222', 'conversation.write', 'Write conversations', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, created_by)
VALUES
  ('31111111-1111-1111-1111-111111111111', '41111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('31111111-1111-1111-1111-111111111111', '42222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('32222222-2222-2222-2222-222222222222', '41111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO membership_roles (membership_id, role_id, created_by)
VALUES
  ('10000000-0000-0000-0000-000000000001', '31111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('20000000-0000-0000-0000-000000000001', '32222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (membership_id, role_id) DO NOTHING;

-- ============================================================================
-- RLS isolation & permission query examples
-- ============================================================================
-- Example A: Alice in company ACME should only see ACME rows.
-- SET app.user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- SET app.company_id = '11111111-1111-1111-1111-111111111111';
-- SELECT id, company_code FROM companies ORDER BY company_code;
-- SELECT company_id, user_id FROM memberships ORDER BY company_id, user_id;

-- Example B: Same user switched to Binary Logistics tenant context.
-- SET app.company_id = '22222222-2222-2222-2222-222222222222';
-- SELECT company_id, user_id FROM memberships ORDER BY company_id, user_id;

-- Example C: Write isolation should fail if wrong tenant value is used.
-- SET app.company_id = '11111111-1111-1111-1111-111111111111';
-- INSERT INTO conversations (company_id, created_by, title)
-- VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Should fail');
-- -- Expected: ERROR due to WITH CHECK policy.

COMMIT;
