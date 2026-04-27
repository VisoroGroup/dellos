-- 009_schema_hardening.sql
-- Tighten budget_categories typing, add outstanding_items type check,
-- and create budget_entries audit history table.

CREATE TYPE budget_category_kind AS ENUM ('revenue', 'deduction', 'expense', 'summary');

ALTER TABLE budget_categories ADD COLUMN kind budget_category_kind;

UPDATE budget_categories SET kind = 'revenue' WHERE is_revenue = TRUE;

UPDATE budget_categories SET kind = 'deduction' WHERE is_deduction = TRUE;

UPDATE budget_categories SET kind = 'summary' WHERE is_summary_row = TRUE;

UPDATE budget_categories SET kind = 'expense' WHERE kind IS NULL;

ALTER TABLE budget_categories ALTER COLUMN kind SET NOT NULL;

ALTER TABLE budget_categories DROP COLUMN is_revenue;

ALTER TABLE budget_categories DROP COLUMN is_deduction;

ALTER TABLE budget_categories DROP COLUMN is_summary_row;

ALTER TABLE outstanding_items ADD CONSTRAINT outstanding_items_type_check CHECK (type IN ('creanta', 'datorie', 'prestat_nefacturat'));

CREATE TABLE budget_entries_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID,
    category_id UUID NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    week INT,
    planned_old DECIMAL(14,2),
    planned_new DECIMAL(14,2),
    actual_old DECIMAL(14,2),
    actual_new DECIMAL(14,2),
    operation VARCHAR(10) NOT NULL,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_budget_entries_history_entry ON budget_entries_history(entry_id);

CREATE INDEX idx_budget_entries_history_changed_at ON budget_entries_history(changed_at);
