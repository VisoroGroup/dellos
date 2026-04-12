import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { PaymentWithDetails, Payment, PaymentComment, PaymentActivityLogEntry } from '../types';

// Fetch Toate Plățile
export const usePayments = (filters: { status?: string; category?: string; period?: string; recurring?: string }) => {
    return useQuery({
        queryKey: ['payments', filters],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            if (filters.category) params.append('category', filters.category);
            if (filters.period) params.append('period', filters.period);
            if (filters.recurring) params.append('recurring', filters.recurring);

            const { data } = await api.get<PaymentWithDetails[]>(`/payments?${params.toString()}`);
            return data;
        },
    });
};

// Fetch Single Payment
export const usePayment = (id: string | null) => {
    return useQuery({
        queryKey: ['payment', id],
        queryFn: async () => {
            if (!id) return null;
            const { data } = await api.get<PaymentWithDetails>(`/payments/${id}`);
            return data;
        },
        enabled: !!id,
    });
};

// Fetch Sumar Plăți
export const usePaymentSummary = () => {
    return useQuery({
        queryKey: ['payment-summary'],
        queryFn: async () => {
            const { data } = await api.get('/payments/summary');
            return data;
        },
    });
};

// Fetch Chart Plăți
export const usePaymentChart = () => {
    return useQuery({
        queryKey: ['payment-chart'],
        queryFn: async () => {
            const { data } = await api.get('/payments/chart');
            return data;
        },
    });
};

// Creare Plată
export const useCreatePayment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<Payment> & { initial_comment?: string }) => {
            const { data } = await api.post('/payments', payload);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment-summary'] });
            queryClient.invalidateQueries({ queryKey: ['payment-chart'] });
        },
    });
};

// Marcare Plată ca Plătită
export const useMarkPaymentPaid = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (paymentId: string) => {
            const { data } = await api.put(`/payments/${paymentId}/mark-paid`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment-summary'] });
            queryClient.invalidateQueries({ queryKey: ['payment-chart'] });
        },
    });
};

// Fetch Activity Log
export const usePaymentActivity = (paymentId: string) => {
    return useQuery({
        queryKey: ['payment-activity', paymentId],
        queryFn: async () => {
            const { data } = await api.get<PaymentActivityLogEntry[]>(`/payments/${paymentId}/activity`);
            return data;
        },
        enabled: !!paymentId,
    });
};

// Fetch Comments
export const usePaymentComments = (paymentId: string) => {
    return useQuery({
        queryKey: ['payment-comments', paymentId],
        queryFn: async () => {
            const { data } = await api.get<PaymentComment[]>(`/payments/${paymentId}/comments`);
            return data;
        },
        enabled: !!paymentId,
    });
};

// Create Comment
export const useCreatePaymentComment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ paymentId, content }: { paymentId: string; content: string }) => {
            const { data } = await api.post(`/payments/${paymentId}/comments`, { content });
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['payment-comments', variables.paymentId] });
            queryClient.invalidateQueries({ queryKey: ['payment-activity', variables.paymentId] });
        },
    });
};
