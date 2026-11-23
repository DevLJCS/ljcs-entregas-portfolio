CREATE TABLE IF NOT EXISTS work_shift_events (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL,
  type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  km REAL,
  motorcycle_id TEXT NOT NULL DEFAULT 'legacy'
);
CREATE INDEX IF NOT EXISTS shift_events_shift ON work_shift_events(shift_id, occurred_at);
