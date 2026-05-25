ALTER TABLE votings
  ADD COLUMN IF NOT EXISTS published_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS min_stop_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS stopped_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS expired_at timestamp NULL;

ALTER TABLE votings DROP CONSTRAINT IF EXISTS votings_status_check;

ALTER TABLE votings
  ADD CONSTRAINT votings_status_check
  CHECK (
    status IN (
      'draft',
      'council_review',
      'revision_required',
      'pending_publish',
      'published',
      'stopped',
      'completed',
      'expired'
    )
  );

UPDATE votings v
SET publication_end_at = date_trunc('day', m.scheduled_at) + interval '2 months' + interval '1 day' - interval '1 microsecond'
FROM meetings m
WHERE v.meeting_id = m.id
  AND v.publication_start_at IS NOT NULL
  AND (
    v.publication_end_at IS NULL
    OR v.publication_end_at <> date_trunc('day', m.scheduled_at) + interval '2 months' + interval '1 day' - interval '1 microsecond'
  );

UPDATE votings
SET min_stop_at = publication_start_at + interval '7 days'
WHERE publication_start_at IS NOT NULL
  AND min_stop_at IS NULL;

UPDATE votings
SET published_at = publication_start_at
WHERE status IN ('published', 'stopped', 'completed', 'expired')
  AND publication_start_at IS NOT NULL
  AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_votings_publication_start_at ON votings(publication_start_at);
CREATE INDEX IF NOT EXISTS idx_votings_publication_end_at ON votings(publication_end_at);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_label text NULL,
  ADD COLUMN IF NOT EXISTS action_component text NULL;
