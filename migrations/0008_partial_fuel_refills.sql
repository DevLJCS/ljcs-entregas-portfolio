ALTER TABLE expenses ADD COLUMN tank_full INTEGER NOT NULL DEFAULT 1 CHECK (tank_full IN (0, 1));
ALTER TABLE expenses ADD COLUMN fuel_start_level INTEGER;
ALTER TABLE expenses ADD COLUMN fuel_end_level INTEGER;
