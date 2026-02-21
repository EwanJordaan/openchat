CREATE TABLE IF NOT EXISTS ai_usage_daily (
  provider_id TEXT NOT NULL,
  usage_date DATE NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'guest')),
  subject_id TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, usage_date, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_usage_date
  ON ai_usage_daily (usage_date DESC);
