CREATE TABLE IF NOT EXISTS infocenter_announcements (
  id uuid PRIMARY KEY,
  title varchar(255) NOT NULL,
  body_html text NOT NULL,
  body_json jsonb NULL,
  category varchar(100) NOT NULL,
  audience_type varchar(100) NOT NULL,
  audience_filter jsonb NULL,
  status varchar(30) NOT NULL,
  is_visible boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_important boolean NOT NULL DEFAULT false,
  notify_enabled boolean NOT NULL DEFAULT false,
  published_at timestamptz NULL,
  scheduled_at timestamptz NULL,
  actual_until timestamptz NULL,
  hidden_at timestamptz NULL,
  completed_at timestamptz NULL,
  deleted_at timestamptz NULL,
  created_by varchar(255) NOT NULL,
  updated_by varchar(255) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infocenter_announcements_status_check CHECK (
    status IN ('draft', 'scheduled', 'published', 'hidden', 'completed', 'deleted')
  )
);

CREATE INDEX IF NOT EXISTS idx_infocenter_announcements_status_created
ON infocenter_announcements (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_infocenter_announcements_search
ON infocenter_announcements (title, category);

CREATE TABLE IF NOT EXISTS infocenter_announcement_history (
  id uuid PRIMARY KEY,
  announcement_id uuid NOT NULL REFERENCES infocenter_announcements(id) ON DELETE CASCADE,
  action varchar(50) NOT NULL,
  reason text NULL,
  actor_id varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infocenter_announcement_history_announcement
ON infocenter_announcement_history (announcement_id, created_at DESC);

CREATE TABLE IF NOT EXISTS infocenter_announcement_reads (
  id uuid PRIMARY KEY,
  announcement_id uuid NOT NULL REFERENCES infocenter_announcements(id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_infocenter_announcement_reads_announcement
ON infocenter_announcement_reads (announcement_id);
