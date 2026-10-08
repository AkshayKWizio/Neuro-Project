CREATE TABLE IF NOT EXISTS nightline_players (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL,
  season TEXT NOT NULL,
  nickname VARCHAR(20) NOT NULL,
  best_score BIGINT,
  best_distance INTEGER,
  best_coins INTEGER,
  best_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token_hash, season)
);
CREATE INDEX IF NOT EXISTS nightline_standings ON nightline_players (season, best_score DESC, best_at ASC, id ASC) WHERE best_score IS NOT NULL;
CREATE TABLE IF NOT EXISTS nightline_runs (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES nightline_players(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  score BIGINT
);
CREATE INDEX IF NOT EXISTS nightline_player_runs ON nightline_runs (player_id, started_at);
CREATE TABLE IF NOT EXISTS nightline_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE nightline_runs ADD COLUMN IF NOT EXISTS recorded_seconds NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (recorded_seconds >= 0);
CREATE TABLE IF NOT EXISTS nightline_activity (
  token_hash TEXT PRIMARY KEY,
  play_seconds NUMERIC(16,3) NOT NULL DEFAULT 0 CHECK (play_seconds >= 0),
  first_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS nightline_activity_countries (
  token_hash TEXT NOT NULL REFERENCES nightline_activity(token_hash) ON DELETE CASCADE,
  country_code CHAR(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  PRIMARY KEY (token_hash, country_code)
);
CREATE TABLE IF NOT EXISTS nightline_tracking (
  id TEXT PRIMARY KEY CHECK (id = 'lifetime'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO nightline_tracking (id) VALUES ('lifetime') ON CONFLICT DO NOTHING;
-- Historic scores establish real players, but do not reveal active duration or country.
INSERT INTO nightline_activity (token_hash, play_seconds, first_played_at)
SELECT token_hash, 0, MIN(COALESCE(best_at, created_at))
FROM nightline_players WHERE best_score IS NOT NULL GROUP BY token_hash
ON CONFLICT (token_hash) DO NOTHING;
