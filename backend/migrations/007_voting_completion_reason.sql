ALTER TABLE votings
  ADD COLUMN IF NOT EXISTS completion_reason text NULL,
  ADD COLUMN IF NOT EXISTS completion_type varchar NULL;

UPDATE votings
SET completion_type = 'manual_stop',
    completion_reason = COALESCE(completion_reason, 'Остановлено председателем')
WHERE status = 'stopped'
  AND completion_type IS NULL;

UPDATE votings
SET completion_type = 'deadline_expired',
    completion_reason = COALESCE(completion_reason, 'Истёк установленный законодательством срок для сбора голосов.')
WHERE status IN ('completed', 'expired')
  AND completion_type IS NULL;

