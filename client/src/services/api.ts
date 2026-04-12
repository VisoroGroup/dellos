import axios from 'axios';
import { User } from '../types';
import { safeLocalStorage } from '../utils/storage';

const api = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    const token = safeLocalStorage.get('financiar_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
            safeLocalStorage.remove('financiar_token');
            window.location.href = '/';
        }
        return Promise.reject(err);
    }
);

export default api;

// Auth
export const authApi = {
    me: () => api.get<{ user: User }>('/auth/me').then(r => r.data),
    exchangeCode: (code: string) => api.post<{ token: string; user: User }>('/auth/exchange', { code }).then(r => r.data),
    users: () => api.get<User[]>('/auth/users').then(r => r.data),
};

// Payments
export const paymentsApi = {
    list: (params?: Record<string, any>) => api.get('/payments', { params }).then(r => r.data),
    get: (id: string) => api.get(`/payments/${id}`).then(r => r.data),
    create: (data: any) => api.post('/payments', data).then(r => r.data),
    markPaid: (id: string) => api.put(`/payments/${id}/mark-paid`).then(r => r.data),
    delete: (id: string) => api.delete(`/payments/${id}`).then(r => r.data),
    summary: () => api.get('/payments/summary').then(r => r.data),
    chart: () => api.get('/payments/chart').then(r => r.data),
    comments: (id: string) => api.get(`/payments/${id}/comments`).then(r => r.data),
    addComment: (id: string, content: string) => api.post(`/payments/${id}/comments`, { content }).then(r => r.data),
    activity: (id: string) => api.get(`/payments/${id}/activity`).then(r => r.data),
};

// Budget
export const budgetApi = {
    categories: () => api.get('/budget/categories').then(r => r.data),
    addCategory: (data: any) => api.post('/budget/categories', data).then(r => r.data),
    deleteCategory: (id: string) => api.delete(`/budget/categories/${id}`).then(r => r.data),
    renameCategory: (id: string, name: string) => api.put(`/budget/categories/${id}`, { name }).then(r => r.data),
    entries: (year: number, month: number) => api.get('/budget/entries', { params: { year, month } }).then(r => r.data),
    upsertEntry: (data: any) => api.put('/budget/entries', data).then(r => r.data),
    cashBalance: (year: number) => api.get('/budget/cash-balance', { params: { year } }).then(r => r.data),
    upsertCashBalance: (data: any) => api.put('/budget/cash-balance', data).then(r => r.data),
    summary: (year: number, month: number) => api.get('/budget/summary', { params: { year, month } }).then(r => r.data),
};

// Client Invoices
export const clientInvoicesApi = {
    list: (params?: Record<string, any>) => api.get('/client-invoices', { params }).then(r => r.data),
    summary: () => api.get('/client-invoices/summary').then(r => r.data),
    clients: () => api.get('/client-invoices/clients').then(r => r.data),
    create: (data: any) => api.post('/client-invoices', data).then(r => r.data),
    update: (id: string, data: any) => api.put(`/client-invoices/${id}`, data).then(r => r.data),
    markPaid: (id: string, data: any) => api.put(`/client-invoices/${id}/mark-paid`, data).then(r => r.data),
    markUnpaid: (id: string) => api.put(`/client-invoices/${id}/mark-unpaid`).then(r => r.data),
    delete: (id: string) => api.delete(`/client-invoices/${id}`).then(r => r.data),
};

// Bank Import
export const bankImportApi = {
    upload: (formData: FormData) => api.post('/bank-import/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
    imports: () => api.get('/bank-import/imports').then(r => r.data),
    getImport: (id: string) => api.get(`/bank-import/imports/${id}`).then(r => r.data),
    match: (id: string) => api.post(`/bank-import/imports/${id}/match`).then(r => r.data),
    approveRow: (rowId: string, data: any) => api.put(`/bank-import/rows/${rowId}/approve`, data).then(r => r.data),
    assignRow: (rowId: string, data: any) => api.put(`/bank-import/rows/${rowId}/assign`, data).then(r => r.data),
    skipRow: (rowId: string) => api.put(`/bank-import/rows/${rowId}/skip`).then(r => r.data),
    approveAll: (id: string) => api.post(`/bank-import/imports/${id}/approve-all`).then(r => r.data),
    complete: (id: string) => api.post(`/bank-import/imports/${id}/complete`).then(r => r.data),
};
