CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rider_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT NOT NULL DEFAULT 'Luan',
  email TEXT,
  password_salt TEXT,
  password_hash TEXT,
  password_iterations INTEGER,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO rider_profile (id, display_name, updated_at)
VALUES (1, 'Luan', CURRENT_TIMESTAMP);

CREATE UNIQUE INDEX IF NOT EXISTS rider_profile_email_idx
  ON rider_profile (email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rides (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  establishment TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 1 CHECK (paid IN (0, 1)),
  note TEXT NOT NULL DEFAULT '',
  motorcycle_id TEXT NOT NULL DEFAULT 'legacy'
);

CREATE INDEX IF NOT EXISTS rides_occurred_at_idx ON rides (occurred_at);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  distance_km REAL,
  liters REAL,
  odometer_km REAL,
  motorcycle_id TEXT NOT NULL DEFAULT 'legacy'
);

CREATE INDEX IF NOT EXISTS expenses_occurred_at_idx ON expenses (occurred_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_goal_cents', '20000');
INSERT OR IGNORE INTO settings (key, value) VALUES ('fuel_level', '6');

CREATE TABLE IF NOT EXISTS work_shifts (
 id TEXT PRIMARY KEY, day TEXT NOT NULL, started_at INTEGER NOT NULL,
 ended_at INTEGER, paused_at INTEGER, paused_ms INTEGER NOT NULL DEFAULT 0,
 start_km REAL NOT NULL, end_km REAL, motorcycle_id TEXT NOT NULL DEFAULT 'legacy',
 CHECK(end_km IS NULL OR end_km >= start_km)
);
CREATE UNIQUE INDEX IF NOT EXISTS single_active_shift ON work_shifts ((1)) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS shifts_day ON work_shifts(day);
CREATE TABLE IF NOT EXISTS maintenance (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, last_km REAL NOT NULL, interval_km REAL NOT NULL, motorcycle_id TEXT NOT NULL DEFAULT 'legacy'
);

CREATE INDEX IF NOT EXISTS expenses_motorcycle_date ON expenses(motorcycle_id, occurred_at);
CREATE INDEX IF NOT EXISTS shifts_motorcycle_day ON work_shifts(motorcycle_id, day);
CREATE INDEX IF NOT EXISTS maintenance_motorcycle ON maintenance(motorcycle_id);

CREATE INDEX IF NOT EXISTS rides_motorcycle_date ON rides(motorcycle_id, occurred_at);

CREATE TABLE IF NOT EXISTS work_shift_events (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL,
  type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  km REAL,
  fuel_level INTEGER,
  motorcycle_id TEXT NOT NULL DEFAULT 'legacy'
);
CREATE INDEX IF NOT EXISTS shift_events_shift ON work_shift_events(shift_id, occurred_at);

CREATE TABLE IF NOT EXISTS credential_details (
  credential_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT ''
);
