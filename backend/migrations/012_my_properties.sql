ALTER TABLE property
ADD COLUMN IF NOT EXISTS erc_account varchar(100),
ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE property_owners
ADD COLUMN IF NOT EXISTS payer_status varchar(50) DEFAULT 'confirmed',
ADD COLUMN IF NOT EXISTS payer_updated_at timestamp DEFAULT now();

ALTER TABLE property_owners DROP CONSTRAINT IF EXISTS property_owners_payer_status_check;

ALTER TABLE property_owners
ADD CONSTRAINT property_owners_payer_status_check
CHECK (
  payer_status IN (
    'confirmed',
    'pending',
    'not_confirmed',
    'rejected'
  )
);

CREATE TABLE IF NOT EXISTS property_update_requests (
  id varchar(100) PRIMARY KEY,
  property_id varchar(100) NOT NULL REFERENCES property(id),
  user_id varchar(100) NOT NULL REFERENCES users(id),
  request_type varchar(100) NOT NULL,
  old_value text,
  new_value text,
  comment text,
  status varchar(50) NOT NULL DEFAULT 'pending',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_update_requests_user_created
ON property_update_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_update_requests_property_created
ON property_update_requests (property_id, created_at DESC);
