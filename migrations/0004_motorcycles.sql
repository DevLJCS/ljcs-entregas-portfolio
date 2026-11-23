ALTER TABLE expenses ADD COLUMN motorcycle_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE work_shifts ADD COLUMN motorcycle_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE maintenance ADD COLUMN motorcycle_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX expenses_motorcycle_date ON expenses(motorcycle_id, occurred_at);
CREATE INDEX shifts_motorcycle_day ON work_shifts(motorcycle_id, day);
CREATE INDEX maintenance_motorcycle ON maintenance(motorcycle_id);
ALTER TABLE rides ADD COLUMN motorcycle_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX rides_motorcycle_date ON rides(motorcycle_id, occurred_at);
