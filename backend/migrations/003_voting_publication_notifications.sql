CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  voting_id text NULL REFERENCES votings(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  read_at timestamp NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_voting_publication_user
  ON notifications (user_id, voting_id, type)
  WHERE type = 'voting_published' AND voting_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON notifications (user_id, created_at DESC);
