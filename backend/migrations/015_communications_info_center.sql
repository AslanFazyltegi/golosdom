CREATE TABLE IF NOT EXISTS communication_posts (
  id text PRIMARY KEY,
  building_id text NOT NULL REFERENCES building(id),
  author_user_id text NOT NULL REFERENCES users(id),
  type text NOT NULL CHECK (type IN ('news', 'announcement')),
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'hidden', 'deleted')),
  importance text NOT NULL DEFAULT 'normal' CHECK (importance IN ('normal', 'important', 'urgent')),
  is_pinned boolean NOT NULL DEFAULT false,
  publish_at timestamp,
  visible_from timestamp,
  visible_until timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_communication_posts_building_type_status
ON communication_posts (building_id, type, status);

CREATE TABLE IF NOT EXISTS communication_post_targets (
  id text PRIMARY KEY,
  post_id text NOT NULL REFERENCES communication_posts(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('all', 'role', 'property_type', 'user')),
  target_value text
);

CREATE INDEX IF NOT EXISTS idx_communication_post_targets_post
ON communication_post_targets (post_id);

CREATE TABLE IF NOT EXISTS communication_notifications (
  id text PRIMARY KEY,
  building_id text NOT NULL REFERENCES building(id),
  author_user_id text NOT NULL REFERENCES users(id),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'deleted')),
  created_at timestamp NOT NULL DEFAULT now(),
  sent_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_communication_notifications_building_status
ON communication_notifications (building_id, status);

CREATE TABLE IF NOT EXISTS communication_notification_targets (
  id text PRIMARY KEY,
  notification_id text NOT NULL REFERENCES communication_notifications(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('all', 'role', 'property_type', 'user')),
  target_value text
);

CREATE INDEX IF NOT EXISTS idx_communication_notification_targets_notification
ON communication_notification_targets (notification_id);

CREATE TABLE IF NOT EXISTS communication_channels (
  id text PRIMARY KEY,
  post_id text REFERENCES communication_posts(id) ON DELETE CASCADE,
  notification_id text REFERENCES communication_notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('portal', 'whatsapp', 'telegram', 'sms')),
  enabled boolean NOT NULL DEFAULT true,
  CONSTRAINT communication_channels_entity_check CHECK (
    (post_id IS NOT NULL AND notification_id IS NULL)
    OR (post_id IS NULL AND notification_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_communication_channels_post
ON communication_channels (post_id);

CREATE INDEX IF NOT EXISTS idx_communication_channels_notification
ON communication_channels (notification_id);

CREATE TABLE IF NOT EXISTS communication_deliveries (
  id text PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('post', 'notification')),
  entity_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  channel text NOT NULL CHECK (channel IN ('portal', 'whatsapp', 'telegram', 'sms')),
  status text NOT NULL CHECK (status IN ('created', 'queued', 'sent', 'delivered', 'read', 'failed', 'channel_not_connected')),
  sent_at timestamp,
  delivered_at timestamp,
  read_at timestamp,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_deliveries_unique
ON communication_deliveries (entity_type, entity_id, user_id, channel);

CREATE INDEX IF NOT EXISTS idx_communication_deliveries_user_status
ON communication_deliveries (user_id, status);

CREATE TABLE IF NOT EXISTS communication_read_receipts (
  id text PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('post', 'notification')),
  entity_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  read_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT communication_read_receipts_unique UNIQUE (entity_type, entity_id, user_id)
);

INSERT INTO navigation_items (id, code, title, icon, parent_id, component, sort_order, is_active)
SELECT 'nav-info-center', 'info_center', 'Инфоцентр', '📢', NULL, 'communication_news', 7, true
WHERE NOT EXISTS (SELECT 1 FROM navigation_items WHERE code = 'info_center');

INSERT INTO navigation_items (id, code, title, icon, parent_id, component, sort_order, is_active)
SELECT item.id, item.code, item.title, item.icon, parent.id, item.component, item.sort_order, true
FROM (
  VALUES
    ('nav-communication-news', 'communication_news', 'Новости', '📰', 'communication_news', 10),
    ('nav-communication-announcements', 'communication_announcements', 'Объявления', '📢', 'communication_announcements', 20),
    ('nav-communication-notifications', 'communication_notifications', 'Уведомления', '🔔', 'communication_notifications', 30),
    ('nav-communication-deliveries', 'communication_deliveries', 'Отчёты доставки', '📨', 'communication_deliveries', 40)
) AS item(id, code, title, icon, component, sort_order)
JOIN navigation_items parent ON parent.code = 'info_center'
WHERE NOT EXISTS (SELECT 1 FROM navigation_items existing WHERE existing.code = item.code);

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
  true,
  true,
  true,
  false
FROM roles r
JOIN navigation_items ni ON ni.code IN (
  'info_center',
  'communication_news',
  'communication_announcements',
  'communication_notifications',
  'communication_deliveries'
)
WHERE r.code = 'CHAIRMAN'
ON CONFLICT (role_id, navigation_item_id) DO UPDATE SET
  can_view = true,
  can_create = true,
  can_update = true,
  can_delete = true;

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
JOIN navigation_items ni ON ni.code IN (
  'communication_news',
  'communication_announcements',
  'communication_notifications'
)
WHERE r.code = 'OWNER'
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
  AND ni.code IN ('info_center', 'communication_deliveries');
