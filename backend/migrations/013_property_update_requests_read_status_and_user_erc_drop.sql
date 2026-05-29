ALTER TABLE property_update_requests
ADD COLUMN IF NOT EXISTS read_at timestamp NULL;

CREATE INDEX IF NOT EXISTS idx_property_update_requests_unread_created
ON property_update_requests (created_at DESC)
WHERE read_at IS NULL;

ALTER TABLE users
DROP COLUMN IF EXISTS erc_account;
