CREATE TABLE IF NOT EXISTS infocenter_news (
  id uuid PRIMARY KEY,
  title varchar(255) NOT NULL,
  summary text NOT NULL,
  body_json jsonb NOT NULL,
  body_html text NOT NULL,
  category varchar(100) NOT NULL,
  audience_type varchar(100) NOT NULL,
  audience_filter jsonb,
  status varchar(30) NOT NULL,
  is_visible boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_important boolean NOT NULL DEFAULT false,
  notify_enabled boolean NOT NULL DEFAULT false,
  cover_image_id uuid,
  published_at timestamptz,
  scheduled_at timestamptz,
  hidden_at timestamptz,
  unpublished_at timestamptz,
  deleted_at timestamptz,
  created_by varchar(255) NOT NULL,
  updated_by varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infocenter_news_status_check CHECK (
    status IN ('draft', 'scheduled', 'published', 'hidden', 'unpublished', 'deleted')
  )
);

CREATE INDEX IF NOT EXISTS idx_infocenter_news_status_created
ON infocenter_news (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_infocenter_news_search
ON infocenter_news (title, category);

CREATE TABLE IF NOT EXISTS infocenter_news_images (
  id uuid PRIMARY KEY,
  news_id uuid NOT NULL REFERENCES infocenter_news(id) ON DELETE CASCADE,
  file_name varchar(255) NOT NULL,
  file_path text NOT NULL,
  file_url text NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infocenter_news_images_news
ON infocenter_news_images (news_id, sort_order, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'infocenter_news_cover_image_fk'
  ) THEN
    ALTER TABLE infocenter_news
    ADD CONSTRAINT infocenter_news_cover_image_fk
    FOREIGN KEY (cover_image_id)
    REFERENCES infocenter_news_images(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS infocenter_news_action_history (
  id uuid PRIMARY KEY,
  news_id uuid NOT NULL REFERENCES infocenter_news(id) ON DELETE CASCADE,
  action varchar(50) NOT NULL,
  reason text,
  actor_id varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infocenter_news_history_news
ON infocenter_news_action_history (news_id, created_at DESC);

CREATE TABLE IF NOT EXISTS infocenter_news_reads (
  id uuid PRIMARY KEY,
  news_id uuid NOT NULL REFERENCES infocenter_news(id) ON DELETE CASCADE,
  user_id varchar(255) NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (news_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_infocenter_news_reads_news
ON infocenter_news_reads (news_id);
