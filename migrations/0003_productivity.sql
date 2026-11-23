CREATE TABLE IF NOT EXISTS work_shifts (
 id TEXT PRIMARY KEY, day TEXT NOT NULL, started_at INTEGER NOT NULL,
 ended_at INTEGER, paused_at INTEGER, paused_ms INTEGER NOT NULL DEFAULT 0,
 start_km REAL NOT NULL, end_km REAL,
 CHECK(end_km IS NULL OR end_km >= start_km)
);
CREATE UNIQUE INDEX IF NOT EXISTS single_active_shift ON work_shifts ((1)) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS shifts_day ON work_shifts(day);
CREATE TABLE IF NOT EXISTS maintenance (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, last_km REAL NOT NULL, interval_km REAL NOT NULL
);
