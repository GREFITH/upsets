-- Audit trail for Harvest manual syncs (from-date override, full resync, entry counts).
CREATE TABLE IF NOT EXISTS harvest_sync_history (
  id              BIGSERIAL PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL CHECK (status IN ('running','success','failed')),
  from_date       DATE,
  full_resync     BOOLEAN NOT NULL DEFAULT FALSE,
  entries_synced  INTEGER,
  trigger_source  TEXT NOT NULL DEFAULT 'manual',
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_harvest_sync_history_started_at ON harvest_sync_history (started_at DESC);
