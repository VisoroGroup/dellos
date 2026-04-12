export interface User {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string | null;
    role: string;
    departments?: string[];
    is_active: boolean;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export type PaymentCategory =
    | 'stat'
    | 'partener_furnizor'
    | 'furnizor_servicii'
    | 'furnizor_echipamente'
    | 'marketing'
    | 'salarii'
    | 'incasare_client'
    | 'alte_venituri';

export type PaymentStatus = 'de_platit' | 'platit';

export type PaymentActionType =
    | 'created'
    | 'marked_paid'
    | 'date_changed'
    | 'comment_added'
    | 'recurring_created'
    | 'category_changed'
    | 'payment_deleted';

export interface Payment {
    id: string;
    title: string;
    amount: string | number;
    currency: string;
    category: PaymentCategory;
    beneficiary_name: string | null;
    due_date: string;
    status: PaymentStatus;
    paid_at: string | null;
    paid_by: string | null;
    is_recurring: boolean;
    recurring_frequency: RecurringFrequency | null;
    recurring_next_date: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
}

export interface PaymentWithDetails extends Payment {
    creator_name?: string;
    creator_avatar?: string | null;
    payer_name?: string | null;
    payer_avatar?: string | null;
}

export interface PaymentComment {
    id: string;
    payment_id: string;
    author_id: string;
    author_name?: string;
    author_avatar?: string | null;
    content: string;
    created_at: string;
    updated_at: string;
}

export interface PaymentActivityLogEntry {
    id: string;
    payment_id: string;
    user_id: string;
    user_name?: string;
    user_avatar?: string | null;
    action_type: PaymentActionType;
    details: Record<string, any>;
    created_at: string;
}

export const PAYMENT_CATEGORIES: Record<PaymentCategory, { label: string; color: string }> = {
    stat: { label: 'Stat (ANAF, taxe, impozite)', color: '#DC2626' },
    partener_furnizor: { label: 'Partener / Furnizor', color: '#2563EB' },
    furnizor_servicii: { label: 'Furnizor de servicii', color: '#7C3AED' },
    furnizor_echipamente: { label: 'Furnizor de echipamente', color: '#0891B2' },
    marketing: { label: 'Marketing / Publicitate', color: '#EA580C' },
    salarii: { label: 'Salarii / Personal', color: '#16A34A' },
    incasare_client: { label: 'Încasare client', color: '#059669' },
    alte_venituri: { label: 'Alte venituri', color: '#0D9488' },
};

export const PAYMENT_STATUSES: Record<PaymentStatus, { label: string; color: string; bg: string; border: string }> = {
    de_platit: { label: 'De plătit', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)' },
    platit: { label: 'Plătit', color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)' },
};

export const FREQUENCIES: Record<RecurringFrequency, string> = {
    daily: 'Zilnic',
    weekly: 'Săptămânal',
    biweekly: 'Bisăptămânal',
    monthly: 'Lunar',
    quarterly: 'Trimestrial',
    yearly: 'Anual',
};
