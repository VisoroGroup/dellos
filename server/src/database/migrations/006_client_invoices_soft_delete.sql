-- Migration 041: Add soft delete to client_invoices

ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_client_invoices_deleted ON client_invoices(deleted_at) WHERE deleted_at IS NULL;
