-- Migration 038: Budget Planning Module
-- Digitalized version of "Penzugyi Tervezes Malaga.xlsx"

-- A) Budget categories (the row labels — departments + sub-items)
CREATE TABLE IF NOT EXISTS budget_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    section VARCHAR(100) NOT NULL,
    section_label VARCHAR(255),
    parent_id UUID REFERENCES budget_categories(id) ON DELETE CASCADE,
    order_index INT DEFAULT 0,
    is_summary_row BOOLEAN DEFAULT false,
    is_revenue BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- B) Budget entries (the cell values — planned/actual per category per week/month)
CREATE TABLE IF NOT EXISTS budget_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    week INT CHECK (week IS NULL OR week BETWEEN 1 AND 5),
    planned DECIMAL(14,2) DEFAULT 0,
    actual DECIMAL(14,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'RON',
    notes TEXT,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, year, month, week)
);

-- C) Cash balance snapshots
CREATE TABLE IF NOT EXISTS cash_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INT NOT NULL,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    week INT CHECK (week IS NULL OR week BETWEEN 1 AND 5),
    balance DECIMAL(14,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'RON',
    notes TEXT,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(year, month, week, currency)
);

-- D) Client invoices (which client paid which invoice, when, how much)
CREATE TABLE IF NOT EXISTS client_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(100),
    amount DECIMAL(14,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'RON',
    issued_date DATE NOT NULL,
    due_date DATE,
    is_paid BOOLEAN DEFAULT false,
    paid_date DATE,
    paid_amount DECIMAL(14,2),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- E) Outstanding items (kintlévőségek, tartozások, leszolgáltatott de nem számlázott)
CREATE TABLE IF NOT EXISTS outstanding_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(30) NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'RON',
    counterparty VARCHAR(255),
    year INT NOT NULL,
    month INT NOT NULL,
    week INT,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_budget_entries_period ON budget_entries(year, month, week);
CREATE INDEX IF NOT EXISTS idx_budget_entries_cat ON budget_entries(category_id);
CREATE INDEX IF NOT EXISTS idx_client_invoices_paid ON client_invoices(is_paid);
CREATE INDEX IF NOT EXISTS idx_client_invoices_client ON client_invoices(client_name);
CREATE INDEX IF NOT EXISTS idx_outstanding_items_type ON outstanding_items(type, is_resolved);
