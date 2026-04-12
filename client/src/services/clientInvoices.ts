import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';

export interface ClientInvoice {
    id: string;
    client_name: string;
    invoice_number: string | null;
    amount: number;
    currency: string;
    issued_date: string;
    due_date: string | null;
    is_paid: boolean;
    paid_date: string | null;
    paid_amount: number | null;
    notes: string | null;
    created_by: string;
    creator_name?: string;
    created_at: string;
}

export interface InvoiceSummary {
    total: number;
    paid_count: number;
    unpaid_count: number;
    unpaid_total: number;
    paid_total: number;
    collected_total: number;
    grand_total: number;
}

export function useClientInvoices(filters?: Record<string, any>) {
    return useQuery<ClientInvoice[]>({
        queryKey: ['client-invoices', filters],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters) {
                for (const [k, v] of Object.entries(filters)) {
                    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
                }
            }
            const { data } = await api.get(`/client-invoices?${params}`);
            return data;
        },
    });
}

export function useInvoiceSummary() {
    return useQuery<InvoiceSummary>({
        queryKey: ['client-invoices-summary'],
        queryFn: async () => {
            const { data } = await api.get('/client-invoices/summary');
            return data;
        },
    });
}

export function useClientNames() {
    return useQuery<string[]>({
        queryKey: ['client-names'],
        queryFn: async () => {
            const { data } = await api.get('/client-invoices/clients');
            return data;
        },
    });
}

export function useCreateInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (invoice: Partial<ClientInvoice>) => {
            const { data } = await api.post('/client-invoices', invoice);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['client-invoices'] });
            qc.invalidateQueries({ queryKey: ['client-invoices-summary'] });
            qc.invalidateQueries({ queryKey: ['client-names'] });
        },
    });
}

export function useUpdateInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: Partial<ClientInvoice> & { id: string }) => {
            const { data: result } = await api.put(`/client-invoices/${id}`, data);
            return result;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['client-invoices'] });
            qc.invalidateQueries({ queryKey: ['client-invoices-summary'] });
        },
    });
}

export function useMarkInvoicePaid() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, paid_date, paid_amount }: { id: string; paid_date?: string; paid_amount?: number }) => {
            const { data } = await api.put(`/client-invoices/${id}/mark-paid`, { paid_date, paid_amount });
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['client-invoices'] });
            qc.invalidateQueries({ queryKey: ['client-invoices-summary'] });
        },
    });
}

export function useMarkInvoiceUnpaid() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.put(`/client-invoices/${id}/mark-unpaid`);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['client-invoices'] });
            qc.invalidateQueries({ queryKey: ['client-invoices-summary'] });
        },
    });
}

export function useDeleteInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.delete(`/client-invoices/${id}`);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['client-invoices'] });
            qc.invalidateQueries({ queryKey: ['client-invoices-summary'] });
            qc.invalidateQueries({ queryKey: ['client-names'] });
        },
    });
}
