-- Migration 039: Bank Statement Import tables

CREATE TABLE IF NOT EXISTS bank_statement_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(500),
    file_data BYTEA,
    bank_account_name VARCHAR(255) DEFAULT 'Raiffeisen',
    currency VARCHAR(10) DEFAULT 'RON',
    period_start DATE,
    period_end DATE,
    total_transactions INT DEFAULT 0,
    matched_count INT DEFAULT 0,
    created_count INT DEFAULT 0,
    skipped_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    imported_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bank_statement_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id UUID REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
    row_index INT,
    transaction_date DATE,
    description TEXT,
    debit DECIMAL(14,2),
    credit DECIMAL(14,2),
    currency VARCHAR(10) DEFAULT 'RON',
    reference VARCHAR(255),
    counterparty VARCHAR(255),
    raw_data JSONB,
    match_status VARCHAR(20) DEFAULT 'unmatched',
    matched_payment_id UUID REFERENCES payments(id),
    match_confidence DECIMAL(5,2),
    match_reason TEXT,
    category_suggestion VARCHAR(50),
    approved BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bsr_import ON bank_statement_rows(import_id);
CREATE INDEX IF NOT EXISTS idx_bsr_status ON bank_statement_rows(match_status);
CREATE INDEX IF NOT EXISTS idx_bsi_status ON bank_statement_imports(status);
