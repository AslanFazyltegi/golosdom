ALTER TABLE votings
  ADD COLUMN IF NOT EXISTS publication_start_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS publication_end_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS publication_send_notifications boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publication_scheduled_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'not_scheduled';

CREATE INDEX IF NOT EXISTS idx_votings_publication_status ON votings(publication_status);
