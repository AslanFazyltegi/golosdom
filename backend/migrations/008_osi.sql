ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS osi (
  id text PRIMARY KEY,
  name text NOT NULL,
  bin varchar(12),
  address text,
  chairman_user_id text REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE building
ADD COLUMN IF NOT EXISTS osi_id text REFERENCES osi(id);

INSERT INTO osi (id, name, bin, address, chairman_user_id)
SELECT
  'osi-1',
  'ОСИ "ЖК Galamat Park"',
  NULL,
  'г. Астана, Нура, проспект Улы Дала, д. 35',
  u.id
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE u.email = 'chairman@test.com'
  AND r.code = 'CHAIRMAN'
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  bin = EXCLUDED.bin,
  address = EXCLUDED.address,
  chairman_user_id = EXCLUDED.chairman_user_id,
  updated_at = now();

UPDATE building
SET osi_id = 'osi-1'
WHERE id = 'building-1';
