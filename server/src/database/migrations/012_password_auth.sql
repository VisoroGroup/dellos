-- Migration 012: Add password authentication (alongside Microsoft OAuth)

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
