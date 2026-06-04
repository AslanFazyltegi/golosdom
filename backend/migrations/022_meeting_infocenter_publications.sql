ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS building_id text REFERENCES building(id),
  ADD COLUMN IF NOT EXISTS notification_id text REFERENCES communication_notifications(id),
  ADD COLUMN IF NOT EXISTS announcement_id uuid REFERENCES infocenter_announcements(id),
  ADD COLUMN IF NOT EXISTS deduplication_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_deduplication_key
ON meetings (deduplication_key)
WHERE deduplication_key IS NOT NULL;

ALTER TABLE communication_notifications
  ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES meetings(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_notifications_meeting_id
ON communication_notifications (meeting_id)
WHERE meeting_id IS NOT NULL;

ALTER TABLE infocenter_announcements
  ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES meetings(id),
  ADD COLUMN IF NOT EXISTS pinned_until timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_infocenter_announcements_meeting_id
ON infocenter_announcements (meeting_id)
WHERE meeting_id IS NOT NULL;
