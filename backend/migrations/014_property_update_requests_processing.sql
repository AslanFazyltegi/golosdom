ALTER TABLE property_update_requests
ADD COLUMN IF NOT EXISTS processed_at timestamp NULL,
ADD COLUMN IF NOT EXISTS processed_by varchar(100) NULL REFERENCES users(id);

ALTER TABLE property_update_requests
ALTER COLUMN status SET DEFAULT 'pending';

UPDATE property_update_requests
SET status = 'pending'
WHERE status IS NULL OR trim(status) = '';

CREATE INDEX IF NOT EXISTS idx_property_update_requests_status_created
ON property_update_requests (status, created_at DESC);
