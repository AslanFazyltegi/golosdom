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
  'auditor-my-building',
  r.id,
  ni.id,
  true,
  false,
  false,
  false,
  false
FROM roles r
JOIN navigation_items ni ON ni.code = 'my_building'
WHERE r.code = 'AUDITOR'
ON CONFLICT (role_id, navigation_item_id) DO UPDATE SET
  can_view = true,
  can_create = false,
  can_update = false,
  can_delete = false;

UPDATE role_navigation_permissions rnp
SET can_view = false
FROM roles r, navigation_items ni
WHERE rnp.role_id = r.id
  AND rnp.navigation_item_id = ni.id
  AND r.code = 'OWNER'
  AND ni.code = 'my_building';

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
  'owner-my-properties',
  r.id,
  ni.id,
  true,
  false,
  false,
  false,
  false
FROM roles r
JOIN navigation_items ni ON ni.code = 'my_properties'
WHERE r.code = 'OWNER'
ON CONFLICT (role_id, navigation_item_id) DO UPDATE SET
  can_view = true,
  can_create = false,
  can_update = false,
  can_delete = false;
