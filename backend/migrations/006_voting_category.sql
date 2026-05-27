ALTER TABLE votings
  ADD COLUMN IF NOT EXISTS category text;

UPDATE votings
SET category = 'general'
WHERE category IS NULL OR btrim(category) = '';

ALTER TABLE votings
  ALTER COLUMN category SET DEFAULT 'general',
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE votings DROP CONSTRAINT IF EXISTS votings_category_check;

ALTER TABLE votings
  ADD CONSTRAINT votings_category_check
  CHECK (
    category IN (
      'general',
      'apartments_and_commercial',
      'parking_and_storerooms'
    )
  );

CREATE INDEX IF NOT EXISTS idx_votings_category ON votings(category);
