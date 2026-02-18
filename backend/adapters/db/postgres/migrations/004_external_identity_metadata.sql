ALTER TABLE external_identities
  ADD COLUMN IF NOT EXISTS provider_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS email TEXT NULL,
  ADD COLUMN IF NOT EXISTS name TEXT NULL,
  ADD COLUMN IF NOT EXISTS raw_claims_json JSONB NULL,
  ADD COLUMN IF NOT EXISTS last_authenticated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_external_identities_last_authenticated_at
  ON external_identities (last_authenticated_at DESC NULLS LAST);
