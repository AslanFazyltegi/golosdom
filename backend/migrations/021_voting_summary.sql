CREATE TABLE IF NOT EXISTS voting_action_logs (
  id text PRIMARY KEY,
  voting_id text NOT NULL REFERENCES votings(id) ON DELETE CASCADE,
  actor_user_id text NULL REFERENCES users(id),
  actor_role text NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voting_action_logs_voting_created
ON voting_action_logs (voting_id, created_at DESC);

INSERT INTO navigation_items (id, code, title, icon, parent_id, component, sort_order, is_active)
SELECT
  'nav-voting-summary',
  'voting_summary',
  'Свод голосований',
  '📊',
  parent.id,
  'voting_summary',
  0,
  true
FROM navigation_items parent
WHERE parent.code = 'votings'
  AND NOT EXISTS (
    SELECT 1
    FROM navigation_items existing
    WHERE existing.code = 'voting_summary'
  );

INSERT INTO role_navigation_permissions (
  id,
  role_id,
  navigation_item_id,
  can_view,
  can_create,
  can_update,
  can_delete,
  is_default
)
SELECT
  r.id || '-' || ni.id,
  r.id,
  ni.id,
  true,
  false,
  false,
  false,
  false
FROM roles r
JOIN navigation_items ni ON ni.code = 'votings'
WHERE r.code = 'COUNCIL_MEMBER'
  AND NOT EXISTS (
    SELECT 1
    FROM role_navigation_permissions existing
    WHERE existing.role_id = r.id
      AND existing.navigation_item_id = ni.id
  );

INSERT INTO role_navigation_permissions (
  id,
  role_id,
  navigation_item_id,
  can_view,
  can_create,
  can_update,
  can_delete,
  is_default
)
SELECT
  r.id || '-' || ni.id,
  r.id,
  ni.id,
  true,
  false,
  false,
  false,
  false
FROM roles r
JOIN navigation_items ni ON ni.code = 'voting_summary'
WHERE r.code IN ('CHAIRMAN', 'COUNCIL_MEMBER')
  AND NOT EXISTS (
    SELECT 1
    FROM role_navigation_permissions existing
    WHERE existing.role_id = r.id
      AND existing.navigation_item_id = ni.id
  );
