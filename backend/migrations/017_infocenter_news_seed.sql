WITH seed_actor AS (
  SELECT COALESCE(
    (SELECT id FROM users WHERE email = 'chairman@test.com' LIMIT 1),
    'seed-chairman'
  ) AS actor_id
),
seed_news (
  id,
  title,
  summary,
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
  hidden_at,
  unpublished_at,
  deleted_at,
  created_at
) AS (
  VALUES
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'Отключение воды 12 июня',
    '12 июня с 09:00 до 18:00 будет временное отключение холодной воды из-за плановых работ.',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Отключение воды"}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Уважаемые собственники!"}]},{"type":"paragraph","content":[{"type":"text","text":"12 июня с 09:00 до 18:00 будет временное отключение холодной воды."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Просим заранее сделать запас воды."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"После завершения работ подача воды будет восстановлена."}]}]}]}]}'::jsonb,
    '<h2>Отключение воды</h2><p><strong>Уважаемые собственники!</strong></p><p>12 июня с 09:00 до 18:00 будет временное отключение холодной воды.</p><ul><li><p>Просим заранее сделать запас воды.</p></li><li><p>После завершения работ подача воды будет восстановлена.</p></li></ul>',
    'Коммунальные работы',
    'all_owners',
    'published',
    true,
    true,
    true,
    true,
    now() - interval '2 days',
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::timestamptz,
    now() - interval '2 days'
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'Субботник во дворе',
    'Черновик приглашения на субботник с перечнем зон уборки и временем сбора.',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Субботник во дворе"}]},{"type":"paragraph","content":[{"type":"text","text":"Планируем совместную уборку двора и озеленение клумб."}]}]}'::jsonb,
    '<h2>Субботник во дворе</h2><p>Планируем совместную уборку двора и озеленение клумб.</p>',
    'Объявления ОСИ',
    'all_owners',
    'draft',
    false,
    false,
    false,
    false,
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::timestamptz,
    now() - interval '1 day'
  ),
  (
    '33333333-3333-4333-8333-333333333333'::uuid,
    'Проверка пожарной сигнализации',
    'Плановая проверка пожарной сигнализации назначена на 20 июня.',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Проверка пожарной сигнализации"}]},{"type":"paragraph","content":[{"type":"text","text":"Просим обеспечить доступ к общедомовым помещениям в назначенное время."}]}]}'::jsonb,
    '<h2>Проверка пожарной сигнализации</h2><p>Просим обеспечить доступ к общедомовым помещениям в назначенное время.</p>',
    'Безопасность',
    'all_owners',
    'scheduled',
    false,
    false,
    true,
    true,
    NULL::timestamptz,
    now() + interval '14 days',
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::timestamptz,
    now() - interval '12 hours'
  ),
  (
    '44444444-4444-4444-8444-444444444444'::uuid,
    'Изменение графика уборки',
    'Новость временно скрыта до согласования обновленного графика клининга.',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Изменение графика уборки"}]},{"type":"paragraph","content":[{"type":"text","text":"Обновленный график уборки подъездов будет опубликован после согласования."}]}]}'::jsonb,
    '<h2>Изменение графика уборки</h2><p>Обновленный график уборки подъездов будет опубликован после согласования.</p>',
    'Сервис',
    'all_owners',
    'hidden',
    false,
    false,
    false,
    false,
    now() - interval '5 days',
    NULL::timestamptz,
    now() - interval '1 hour',
    NULL::timestamptz,
    NULL::timestamptz,
    now() - interval '5 days'
  ),
  (
    '55555555-5555-4555-8555-555555555555'::uuid,
    'Старая версия объявления по тарифам',
    'Материал снят с публикации, потому что тарифная информация была обновлена.',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Старая версия объявления по тарифам"}]},{"type":"paragraph","content":[{"type":"text","text":"Документ больше не актуален и заменен новой публикацией."}]}]}'::jsonb,
    '<h2>Старая версия объявления по тарифам</h2><p>Документ больше не актуален и заменен новой публикацией.</p>',
    'Финансы ОСИ',
    'all_owners',
    'unpublished',
    false,
    false,
    false,
    false,
    now() - interval '10 days',
    NULL::timestamptz,
    NULL::timestamptz,
    now() - interval '1 day',
    NULL::timestamptz,
    now() - interval '10 days'
  ),
  (
    '66666666-6666-4666-8666-666666666666'::uuid,
    'Тестовая новость',
    'Удаленная тестовая новость для проверки восстановления и окончательного удаления.',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Тестовая новость"}]},{"type":"paragraph","content":[{"type":"text","text":"Запись находится в разделе удаленных материалов."}]}]}'::jsonb,
    '<h2>Тестовая новость</h2><p>Запись находится в разделе удаленных материалов.</p>',
    'Тест',
    'all_owners',
    'deleted',
    false,
    false,
    false,
    false,
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::timestamptz,
    NULL::timestamptz,
    now() - interval '2 hours',
    now() - interval '3 hours'
  )
)
INSERT INTO infocenter_news (
  id,
  title,
  summary,
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
  hidden_at,
  unpublished_at,
  deleted_at,
  created_by,
  created_at,
  updated_at
)
SELECT
  seed_news.id,
  seed_news.title,
  seed_news.summary,
  seed_news.body_json,
  seed_news.body_html,
  seed_news.category,
  seed_news.audience_type,
  seed_news.status,
  seed_news.is_visible,
  seed_news.is_pinned,
  seed_news.is_important,
  seed_news.notify_enabled,
  seed_news.published_at,
  seed_news.scheduled_at,
  seed_news.hidden_at,
  seed_news.unpublished_at,
  seed_news.deleted_at,
  seed_actor.actor_id,
  seed_news.created_at,
  seed_news.created_at
FROM seed_news
CROSS JOIN seed_actor
ON CONFLICT (id) DO NOTHING;

INSERT INTO infocenter_news_action_history (id, news_id, action, actor_id, created_at)
SELECT
  CASE n.id
    WHEN '11111111-1111-4111-8111-111111111111' THEN 'aaaaaaaa-1111-4111-8111-111111111111'::uuid
    WHEN '22222222-2222-4222-8222-222222222222' THEN 'aaaaaaaa-2222-4222-8222-222222222222'::uuid
    WHEN '33333333-3333-4333-8333-333333333333' THEN 'aaaaaaaa-3333-4333-8333-333333333333'::uuid
    WHEN '44444444-4444-4444-8444-444444444444' THEN 'aaaaaaaa-4444-4444-8444-444444444444'::uuid
    WHEN '55555555-5555-4555-8555-555555555555' THEN 'aaaaaaaa-5555-4555-8555-555555555555'::uuid
    ELSE 'aaaaaaaa-6666-4666-8666-666666666666'::uuid
  END,
  n.id,
  'created',
  n.created_by,
  n.created_at
FROM infocenter_news n
WHERE n.id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666'
)
AND NOT EXISTS (
  SELECT 1
  FROM infocenter_news_action_history h
  WHERE h.news_id = n.id
    AND h.action = 'created'
);

INSERT INTO infocenter_news_action_history (id, news_id, action, reason, actor_id, created_at)
SELECT 'bbbbbbbb-1111-4111-8111-111111111111'::uuid, id, 'published', NULL, created_by, COALESCE(published_at, created_at)
FROM infocenter_news
WHERE id = '11111111-1111-4111-8111-111111111111'
  AND NOT EXISTS (
    SELECT 1 FROM infocenter_news_action_history h
    WHERE h.news_id = infocenter_news.id AND h.action = 'published'
  );

INSERT INTO infocenter_news_action_history (id, news_id, action, reason, actor_id, created_at)
SELECT 'bbbbbbbb-3333-4333-8333-333333333333'::uuid, id, 'scheduled', NULL, created_by, created_at
FROM infocenter_news
WHERE id = '33333333-3333-4333-8333-333333333333'
  AND NOT EXISTS (
    SELECT 1 FROM infocenter_news_action_history h
    WHERE h.news_id = infocenter_news.id AND h.action = 'scheduled'
  );

INSERT INTO infocenter_news_action_history (id, news_id, action, reason, actor_id, created_at)
SELECT 'bbbbbbbb-4444-4444-8444-444444444444'::uuid, id, 'hidden', 'Скрыто до согласования графика', created_by, COALESCE(hidden_at, created_at)
FROM infocenter_news
WHERE id = '44444444-4444-4444-8444-444444444444'
  AND NOT EXISTS (
    SELECT 1 FROM infocenter_news_action_history h
    WHERE h.news_id = infocenter_news.id AND h.action = 'hidden'
  );

INSERT INTO infocenter_news_action_history (id, news_id, action, reason, actor_id, created_at)
SELECT 'bbbbbbbb-5555-4555-8555-555555555555'::uuid, id, 'unpublished', 'Информация устарела', created_by, COALESCE(unpublished_at, created_at)
FROM infocenter_news
WHERE id = '55555555-5555-4555-8555-555555555555'
  AND NOT EXISTS (
    SELECT 1 FROM infocenter_news_action_history h
    WHERE h.news_id = infocenter_news.id AND h.action = 'unpublished'
  );

INSERT INTO infocenter_news_action_history (id, news_id, action, reason, actor_id, created_at)
SELECT 'bbbbbbbb-6666-4666-8666-666666666666'::uuid, id, 'deleted', NULL, created_by, COALESCE(deleted_at, created_at)
FROM infocenter_news
WHERE id = '66666666-6666-4666-8666-666666666666'
  AND NOT EXISTS (
    SELECT 1 FROM infocenter_news_action_history h
    WHERE h.news_id = infocenter_news.id AND h.action = 'deleted'
  );
