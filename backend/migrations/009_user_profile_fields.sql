ALTER TABLE users
ADD COLUMN IF NOT EXISTS erc_account varchar(64),
ADD COLUMN IF NOT EXISTS photo text;
