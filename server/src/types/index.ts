export interface User {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string | null;
    role: string;
    departments?: string[];
    is_active: boolean;
}

export const PAYMENT_CATEGORIES: Record<PaymentCategory, string> = {
    stat: 'Stat',
    partener_furnizor: 'Partener / Furnizor',
    furnizor_servicii: 'Furnizor Servicii',
    furnizor_echipamente: 'Furnizor Echipamente',
    marketing: 'Marketing',
    salarii: 'Salarii',
    incasare_client: 'Incasare Client',
    alte_venituri: 'Alte Venituri',
};

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

export type PaymentReminderType = 'day_30' | 'day_21' | 'day_14' | 'day_7' | 'day_0' | 'overdue';

export type RecurringFrequency = 'monthly' | 'quarterly' | 'yearly';
