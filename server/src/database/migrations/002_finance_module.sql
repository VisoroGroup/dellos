CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT ('RON'),
    category VARCHAR(50) NOT NULL,
    beneficiary_name VARCHAR(255),
    due_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'de_platit',
    paid_at TIMESTAMP WITH TIME ZONE,
    paid_by UUID REFERENCES users(id),
    is_recurring BOOLEAN DEFAULT false,
    recurring_frequency VARCHAR(50),
    recurring_next_date DATE,
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payment_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payment_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payment_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
    reminder_type VARCHAR(20) NOT NULL,
    scheduled_date DATE NOT NULL,
    actual_sent_date DATE NOT NULL,
    sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_due_date ON payments(due_date);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payment_reminders_sent ON payment_reminders(sent);
CREATE INDEX idx_payment_reminders_actual_sent_date ON payment_reminders(actual_sent_date);
