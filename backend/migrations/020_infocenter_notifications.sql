ALTER TABLE communication_notifications
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS audience_summary text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamp,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamp,
  ADD COLUMN IF NOT EXISTS hidden_at timestamp;

UPDATE communication_notifications
SET body_html = body
WHERE body_html IS NULL;

ALTER TABLE communication_notifications
  ALTER COLUMN body_html SET NOT NULL;

ALTER TABLE communication_notifications
  DROP CONSTRAINT IF EXISTS communication_notifications_status_check;

ALTER TABLE communication_notifications
  ADD CONSTRAINT communication_notifications_status_check
  CHECK (status IN (
    'draft',
    'scheduled',
    'sending',
    'sent',
    'partially_delivered',
    'delivered',
    'partially_read',
    'read',
    'failed',
    'hidden',
    'completed',
    'deleted'
  ));

CREATE INDEX IF NOT EXISTS idx_communication_notifications_search
ON communication_notifications USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(body_html, '')));

UPDATE navigation_items
SET is_active = false
WHERE code = 'communication_deliveries';

UPDATE role_navigation_permissions rnp
SET can_view = false,
    can_create = false,
    can_update = false,
    can_delete = false
FROM navigation_items ni
WHERE rnp.navigation_item_id = ni.id
  AND ni.code = 'communication_deliveries';
