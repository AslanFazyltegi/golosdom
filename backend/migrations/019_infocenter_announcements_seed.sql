WITH seed_announcements (
  id,
  title,
  body_json,
  body_html,
  category,
  audience_type,
  status,
  is_visible,
  is_pinned,
  is_important,
  notify_enabled,
  published_at,
  scheduled_at,
  actual_until,
  completed_at,
  created_at
) AS (
  VALUES
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'Отключение холодной воды 12 июня',
    '{"type":"tinymce-html"}'::jsonb,
    '<h2>Отключение холодной воды</h2><p><strong>Уважаемые собственники!</strong></p><p>12 июня с 09:00 до 18:00 будет временно отключена холодная вода.</p><ol><li>Просим заранее сделать запас воды.</li><li>После завершения работ подача воды будет восстановлена.</li></ol>',
    'Коммунальные работы',
    'all_owners',
    'published',
    true,
    true,
    true,
    true,
    '2026-06-01 09:00:00+05'::timestamptz,
    NULL,
    '2026-06-12 18:00:00+05'::timestamptz,
    NULL,
    '2026-06-01 08:45:00+05'::timestamptz
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'Общее собрание собственников',
    '{"type":"tinymce-html"}'::jsonb,
    '<h2>Общее собрание</h2><p>Приглашаем собственников принять участие в общем собрании.</p><ul><li>Отчет председателя</li><li>План работ на июнь</li></ul>',
    'Собрание',
    'all_owners',
    'scheduled',
    false,
    false,
    false,
    true,
    NULL,
    '2026-06-08 10:00:00+05'::timestamptz,
    '2026-06-20 20:00:00+05'::timestamptz,
    NULL,
    '2026-06-01 10:00:00+05'::timestamptz
  ),
  (
    '33333333-3333-4333-8333-333333333333'::uuid,
    'Уборка территории 8 июня',
    '{"type":"tinymce-html"}'::jsonb,
    '<h2>Уборка территории</h2><p>8 июня пройдет плановая уборка двора и прилегающих зон.</p>',
    'Уборка',
    'all_owners',
    'draft',
    false,
    false,
    false,
    false,
    NULL,
    NULL,
    '2026-06-08 20:00:00+05'::timestamptz,
    NULL,
    '2026-06-01 11:00:00+05'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444444'::uuid,
    'Ремонт лифта в 1 подъезде',
    '{"type":"tinymce-html"}'::jsonb,
    '<h2>Ремонт лифта</h2><p><strong>В 1 подъезде</strong> будет выполнен ремонт лифтового оборудования.</p><p>Просим учитывать ограничения при планировании поездок.</p>',
    'Ремонт',
    'all_owners',
    'published',
    true,
    false,
    false,
    false,
    '2026-06-01 12:00:00+05'::timestamptz,
    NULL,
    '2026-06-14 18:00:00+05'::timestamptz,
    NULL,
    '2026-06-01 12:00:00+05'::timestamptz
  ),
  (
    '55555555-5555-4555-8555-555555555555'::uuid,
    'Вывоз крупногабаритного мусора',
    '{"type":"tinymce-html"}'::jsonb,
    '<h2>Вывоз мусора завершен</h2><p>Работы по вывозу крупногабаритного мусора выполнены.</p>',
    'Сервис',
    'all_owners',
    'completed',
    false,
    false,
    false,
    false,
    '2026-05-25 09:00:00+05'::timestamptz,
    NULL,
    '2026-05-30 18:00:00+05'::timestamptz,
    '2026-05-30 18:00:00+05'::timestamptz,
    '2026-05-25 09:00:00+05'::timestamptz
  )
)
INSERT INTO infocenter_announcements (
  id, title, body_json, body_html, category, audience_type, status, is_visible,
  is_pinned, is_important, notify_enabled, published_at, scheduled_at,
  actual_until, completed_at, created_by, created_at, updated_at
)
SELECT
  id, title, body_json, body_html, category, audience_type, status, is_visible,
  is_pinned, is_important, notify_enabled, published_at, scheduled_at,
  actual_until, completed_at, 'system', created_at, created_at
FROM seed_announcements
ON CONFLICT (id) DO NOTHING;

INSERT INTO infocenter_announcement_history (id, announcement_id, action, actor_id, created_at)
VALUES
  ('aaaa1111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'created', 'system', '2026-06-01 08:45:00+05'::timestamptz),
  ('aaaa2222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'created', 'system', '2026-06-01 10:00:00+05'::timestamptz),
  ('aaaa3333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'created', 'system', '2026-06-01 11:00:00+05'::timestamptz),
  ('aaaa4444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', 'created', 'system', '2026-06-01 12:00:00+05'::timestamptz),
  ('aaaa5555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', 'created', 'system', '2026-05-25 09:00:00+05'::timestamptz)
ON CONFLICT DO NOTHING;
