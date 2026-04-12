-- Soft delete for payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index for efficient queries on non-deleted payments
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON payments(deleted_at) WHERE deleted_at IS NULL;
