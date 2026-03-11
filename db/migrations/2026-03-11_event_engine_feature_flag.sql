ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS event_engine_enabled TINYINT(1) NOT NULL DEFAULT 0;

UPDATE settings
SET event_engine_enabled = COALESCE(event_engine_enabled, 0);
