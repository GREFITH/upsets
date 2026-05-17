-- Completion window for audit log (sync "through" date on success).
ALTER TABLE harvest_sync_history
  ADD COLUMN IF NOT EXISTS through_date DATE;
