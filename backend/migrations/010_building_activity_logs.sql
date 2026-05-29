CREATE TABLE IF NOT EXISTS building_activity_logs (
  id text PRIMARY KEY,
  building_id text NOT NULL REFERENCES building(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  description text NOT NULL,
  created_by text REFERENCES users(id),
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_building_activity_logs_building_created
ON building_activity_logs (building_id, created_at DESC);
