import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';

export interface BankImport {
    id: string;
    file_name: string;
    bank_account_name: string;
    currency: string;
    period_start: string;
    period_end: string;
    total_transactions: number;
    matched_count: number;
    created_count: number;
    skipped_count: number;
    status: 'pending' | 'reviewing' | 'completed';
    imported_by_name: string;
    created_at: string;
    completed_at: string | null;
}

export interface BankStatementRow {
    id: string;
    import_id: string;
    row_index: number;
    transaction_date: string | null;
    description: string;
    debit: number | null;
    credit: number | null;
    currency: string;
    reference: string;
    counterparty: string;
    raw_data: Record<string, any>;
    match_status: 'unmatched' | 'matched' | 'created' | 'skipped';
    matched_payment_id: string | null;
    matched_payment_title?: string;
    matched_payment_amount?: number;
    matched_payment_beneficiary?: string;
    match_confidence: number | null;
    match_reason: string | null;
    category_suggestion: string | null;
    approved: boolean;
}

export function useBankImports() {
    return useQuery<BankImport[]>({
        queryKey: ['bank-imports'],
        queryFn: async () => {
            const { data } = await api.get('/bank-import/imports');
            return data;
        },
    });
}

export function useBankImportDetail(importId: string | null) {
    return useQuery<{ import: BankImport; rows: BankStatementRow[] }>({
        queryKey: ['bank-import-detail', importId],
        enabled: !!importId,
        queryFn: async () => {
            const { data } = await api.get(`/bank-import/imports/${importId}`);
            return data;
        },
    });
}

export function useUploadBankStatement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ file, bank_account_name, currency }: { file: File; bank_account_name?: string; currency?: string }) => {
            const formData = new FormData();
            formData.append('file', file);
            if (bank_account_name) formData.append('bank_account_name', bank_account_name);
            if (currency) formData.append('currency', currency);
            const { data } = await api.post('/bank-import/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['bank-imports'] });
        },
    });
}

export function useRunMatching() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (importId: string) => {
            const { data } = await api.post(`/bank-import/imports/${importId}/match`);
            return data;
        },
        onSuccess: (_d, importId) => {
            qc.invalidateQueries({ queryKey: ['bank-import-detail', importId] });
        },
    });
}

export function useApproveRow(importId: string | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (rowId: string) => {
            const { data } = await api.put(`/bank-import/rows/${rowId}/approve`);
            return data;
        },
        onSuccess: () => {
            if (importId) qc.invalidateQueries({ queryKey: ['bank-import-detail', importId] });
        },
    });
}

export function useAssignRow(importId: string | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ rowId, ...body }: { rowId: string; category?: string; title?: string; payment_id?: string }) => {
            const { data } = await api.put(`/bank-import/rows/${rowId}/assign`, body);
            return data;
        },
        onSuccess: () => {
            if (importId) qc.invalidateQueries({ queryKey: ['bank-import-detail', importId] });
        },
    });
}

export function useSkipRow(importId: string | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (rowId: string) => {
            const { data } = await api.put(`/bank-import/rows/${rowId}/skip`);
            return data;
        },
        onSuccess: () => {
            if (importId) qc.invalidateQueries({ queryKey: ['bank-import-detail', importId] });
        },
    });
}

export function useApproveAll() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (importId: string) => {
            const { data } = await api.post(`/bank-import/imports/${importId}/approve-all`);
            return data;
        },
        onSuccess: (_d, importId) => {
            qc.invalidateQueries({ queryKey: ['bank-import-detail', importId] });
        },
    });
}

export function useCompleteImport() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (importId: string) => {
            const { data } = await api.post(`/bank-import/imports/${importId}/complete`);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['bank-imports'] });
            qc.invalidateQueries({ queryKey: ['bank-import-detail'] });
        },
    });
}
