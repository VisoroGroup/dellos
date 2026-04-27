import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';

// === Types ===
export interface BudgetCategory {
    id: string;
    name: string;
    section: string;
    section_label: string;
    parent_id: string | null;
    order_index: number;
    is_summary_row: boolean;
    is_revenue: boolean;
    is_deduction: boolean;
    children?: BudgetCategory[];
}

export interface BudgetEntry {
    id?: string;
    category_id: string;
    year: number;
    month: number;
    week: number | null;
    planned: number;
    actual: number;
    currency: string;
    notes?: string;
    category_name?: string;
    section?: string;
    parent_id?: string | null;
    is_summary_row?: boolean;
    is_revenue?: boolean;
    is_deduction?: boolean;
}

export interface BudgetSummary {
    year: number;
    month: number | null;
    revenue_planned: number;
    revenue_actual: number;
    deduction_planned: number;
    deduction_actual: number;
    adjusted_revenue_planned: number;
    adjusted_revenue_actual: number;
    expense_planned: number;
    expense_actual: number;
    result_planned: number;
    result_actual: number;
    cash_balance: number | null;
}

export interface CashBalance {
    id: string;
    year: number;
    month: number;
    week: number | null;
    balance: number;
    currency: string;
    notes?: string;
}

export type OutstandingType = 'creanta' | 'datorie' | 'prestat_nefacturat';

export interface OutstandingItem {
    id: string;
    type: OutstandingType;
    description: string;
    amount: number;
    currency: string;
    counterparty: string | null;
    year: number;
    month: number;
    week: number | null;
    is_resolved: boolean;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
}

// === Hooks ===

export function useBudgetCategories() {
    return useQuery<BudgetCategory[]>({
        queryKey: ['budget-categories'],
        queryFn: async () => {
            const { data } = await api.get('/budget/categories');
            return data;
        },
    });
}

export function useBudgetEntries(year: number, month?: number) {
    return useQuery<{ year: number; month: number | null; entries: BudgetEntry[] }>({
        queryKey: ['budget-entries', year, month],
        queryFn: async () => {
            const params = new URLSearchParams({ year: String(year) });
            if (month) params.set('month', String(month));
            const { data } = await api.get(`/budget/entries?${params}`);
            return data;
        },
    });
}

export function useBudgetSummary(year: number, month?: number) {
    return useQuery<BudgetSummary>({
        queryKey: ['budget-summary', year, month],
        queryFn: async () => {
            const params = new URLSearchParams({ year: String(year) });
            if (month) params.set('month', String(month));
            const { data } = await api.get(`/budget/summary?${params}`);
            return data;
        },
    });
}

export function useCashBalance(year: number) {
    return useQuery<CashBalance[]>({
        queryKey: ['cash-balance', year],
        queryFn: async () => {
            const { data } = await api.get(`/budget/cash-balance?year=${year}`);
            return data;
        },
    });
}

export function useUpsertEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (entry: Partial<BudgetEntry>) => {
            const { data } = await api.put('/budget/entries', entry);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['budget-entries'] });
            qc.invalidateQueries({ queryKey: ['budget-summary'] });
        },
    });
}

export function useUpsertCashBalance() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (balance: Partial<CashBalance>) => {
            const { data } = await api.put('/budget/cash-balance', balance);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['cash-balance'] });
            qc.invalidateQueries({ queryKey: ['budget-summary'] });
        },
    });
}

export function useAddCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (cat: { name: string; section: string; section_label?: string; parent_id?: string }) => {
            const { data } = await api.post('/budget/categories', cat);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['budget-categories'] });
        },
    });
}

export function useDeleteCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.delete(`/budget/categories/${id}`);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['budget-categories'] });
            qc.invalidateQueries({ queryKey: ['budget-entries'] });
        },
    });
}

export function useRenameCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, name }: { id: string; name: string }) => {
            const { data } = await api.put(`/budget/categories/${id}`, { name });
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['budget-categories'] });
        },
    });
}

// === Outstanding items (Creanțe / Datorii / Prestate nefacturate) ===

export function useOutstandingItems(type?: OutstandingType, year?: number, month?: number) {
    return useQuery<OutstandingItem[]>({
        queryKey: ['outstanding', type, year, month],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (type) params.set('type', type);
            if (year) params.set('year', String(year));
            if (month) params.set('month', String(month));
            const { data } = await api.get(`/budget/outstanding?${params}`);
            return data.map((d: any) => ({ ...d, amount: parseFloat(d.amount) }));
        },
    });
}

export function useAddOutstanding() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (item: {
            type: OutstandingType;
            description: string;
            amount: number;
            currency?: string;
            counterparty?: string;
            year: number;
            month: number;
            week?: number | null;
        }) => {
            const { data } = await api.post('/budget/outstanding', item);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['outstanding'] });
        },
    });
}

export function useUpdateOutstanding() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...patch }: { id: string; description?: string; amount?: number; counterparty?: string; is_resolved?: boolean }) => {
            const { data } = await api.put(`/budget/outstanding/${id}`, patch);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['outstanding'] });
        },
    });
}

export function useDeleteOutstanding() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.delete(`/budget/outstanding/${id}`);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['outstanding'] });
        },
    });
}
