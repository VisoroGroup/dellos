-- 011_schema_hardening_round2.sql
-- Round 2 hardening: missing FK indexes, status CHECK constraints,
-- and payments.amount precision bump.

-- 1. Missing FK indexes
CREATE INDEX IF NOT EXISTS idx_payment_comments_payment_id ON payment_comments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_comments_author_id ON payment_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_payment_activity_log_payment_id ON payment_activity_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_activity_log_user_id ON payment_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_payment_id ON payment_reminders(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_paid_by ON payments(paid_by);
CREATE INDEX IF NOT EXISTS idx_bank_statement_rows_matched_payment_id ON bank_statement_rows(matched_payment_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_rows_approved_by ON bank_statement_rows(approved_by);
CREATE INDEX IF NOT EXISTS idx_budget_entries_updated_by ON budget_entries(updated_by);
CREATE INDEX IF NOT EXISTS idx_client_invoices_created_by ON client_invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_outstanding_items_created_by ON outstanding_items(created_by);
CREATE INDEX IF NOT EXISTS idx_cash_balance_period ON cash_balance(year, month, week);
CREATE INDEX IF NOT EXISTS idx_budget_entries_history_category_id ON budget_entries_history(category_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_history_changed_by ON budget_entries_history(changed_by);

-- 2. Status field CHECK constraints
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('de_platit', 'platit'));
ALTER TABLE bank_statement_imports ADD CONSTRAINT bank_statement_imports_status_check CHECK (status IN ('pending', 'reviewing', 'completed'));
ALTER TABLE bank_statement_rows ADD CONSTRAINT bank_statement_rows_match_status_check CHECK (match_status IN ('unmatched', 'matched', 'created', 'skipped'));
ALTER TABLE anaf_messages ADD CONSTRAINT anaf_messages_zip_status_check CHECK (zip_status IN ('pending', 'downloaded', 'failed'));

-- 3. payments.amount precision bump (DECIMAL(10,2) -> DECIMAL(14,2))
ALTER TABLE payments ALTER COLUMN amount TYPE DECIMAL(14,2);
