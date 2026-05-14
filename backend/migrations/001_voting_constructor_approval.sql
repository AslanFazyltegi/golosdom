ALTER TABLE votings
  ADD COLUMN IF NOT EXISTS meeting_id uuid NULL REFERENCES meetings(id),
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS review_deadline timestamp NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NULL;

CREATE TABLE IF NOT EXISTS voting_approval_reviews (
  id text PRIMARY KEY,
  voting_id text NOT NULL REFERENCES votings(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress', 'approved', 'revision_required', 'no_majority')),
  deadline timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voting_approval_votes (
  id text PRIMARY KEY,
  review_id text NOT NULL REFERENCES voting_approval_reviews(id) ON DELETE CASCADE,
  voting_id text NOT NULL REFERENCES votings(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK (decision IN ('approve', 'revision')),
  comment text NULL,
  reason text NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT voting_approval_votes_one_vote_per_review UNIQUE (review_id, user_id),
  CONSTRAINT voting_approval_votes_revision_requires_text CHECK (
    decision <> 'revision'
    OR (
      comment IS NOT NULL
      AND btrim(comment) <> ''
      AND reason IS NOT NULL
      AND reason IN ('unclear_wording', 'data_error', 'procedure_violation', 'missing_documents', 'other')
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_votings_status ON votings(status);
CREATE INDEX IF NOT EXISTS idx_votings_meeting_id ON votings(meeting_id);
CREATE INDEX IF NOT EXISTS idx_voting_approval_reviews_voting_id ON voting_approval_reviews(voting_id);
CREATE INDEX IF NOT EXISTS idx_voting_approval_votes_review_id ON voting_approval_votes(review_id);

INSERT INTO navigation_items (id, code, title, icon, parent_id, component, sort_order, is_active)
SELECT 'nav-voting-constructor', 'voting_constructor', 'Конструктор голосования', 'ballot', NULL, 'voting_constructor', 40, true
WHERE NOT EXISTS (SELECT 1 FROM navigation_items WHERE code = 'voting_constructor');

INSERT INTO navigation_items (id, code, title, icon, parent_id, component, sort_order, is_active)
SELECT item.id, item.code, item.title, item.icon, parent.id, item.component, item.sort_order, true
FROM (
  VALUES
    ('nav-voting-constructor-create', 'voting_constructor_create', 'Создать опросник', 'plus', 'voting_constructor_create', 10),
    ('nav-voting-constructor-approval', 'voting_constructor_approval', 'На утверждении у совета дома', 'check', 'voting_constructor_approval', 20),
    ('nav-voting-constructor-revision', 'voting_constructor_revision', 'На доработке', 'edit', 'voting_constructor_revision', 30),
    ('nav-voting-constructor-pending-publication', 'voting_constructor_pending_publication', 'Ожидающие публикации', 'clock', 'voting_constructor_pending_publication', 40),
    ('nav-voting-constructor-draft', 'voting_constructor_draft', 'Черновик', 'file', 'voting_constructor_draft', 50)
) AS item(id, code, title, icon, component, sort_order)
JOIN navigation_items parent ON parent.code = 'voting_constructor'
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
  r.code = 'CHAIRMAN',
  r.code = 'CHAIRMAN',
  r.code = 'CHAIRMAN',
  false
FROM roles r
JOIN navigation_items ni ON ni.code IN (
  'voting_constructor',
  'voting_constructor_create',
  'voting_constructor_approval',
  'voting_constructor_revision',
  'voting_constructor_pending_publication',
  'voting_constructor_draft'
)
WHERE r.code = 'CHAIRMAN'
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
JOIN navigation_items ni ON ni.code IN (
  'voting_constructor',
  'voting_constructor_approval'
)
WHERE r.code = 'COUNCIL_MEMBER'
  AND NOT EXISTS (
    SELECT 1
    FROM role_navigation_permissions existing
    WHERE existing.role_id = r.id
      AND existing.navigation_item_id = ni.id
  );
