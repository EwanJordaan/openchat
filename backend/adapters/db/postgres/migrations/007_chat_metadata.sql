ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chats_owner_archived_pinned_updated_at
  ON chats (owner_user_id, is_archived, is_pinned DESC, updated_at DESC);
