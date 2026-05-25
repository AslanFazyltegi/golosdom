CREATE TABLE IF NOT EXISTS voting_submissions (
  id text PRIMARY KEY,
  voting_id text NOT NULL REFERENCES votings(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signature_method text NOT NULL CHECK (signature_method IN ('MOCK_MGOV', 'MOCK_ECP')),
  signature_status text NOT NULL CHECK (signature_status IN ('signed')),
  signed_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT voting_submissions_one_per_user UNIQUE (voting_id, user_id)
);

INSERT INTO voting_submissions (
  id,
  voting_id,
  user_id,
  signature_method,
  signature_status,
  signed_at,
  created_at
)
SELECT
  'voting-submission-' || va.voting_id || '-' || va.voted_by_user_id,
  va.voting_id,
  va.voted_by_user_id,
  'MOCK_ECP',
  'signed',
  COALESCE(MIN(va.signed_at), now()),
  COALESCE(MIN(va.signed_at), now())
FROM voting_answers va
WHERE va.voted_by_user_id IS NOT NULL
GROUP BY va.voting_id, va.voted_by_user_id
ON CONFLICT (voting_id, user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_voting_submissions_voting_id
  ON voting_submissions(voting_id);
