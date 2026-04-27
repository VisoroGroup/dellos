/**
 * ANAF SPV API client.
 *
 * Az osszes /api/anaf/* hivashoz wrapper.
 */

import { api } from './api';

export type ZipStatus = 'pending' | 'downloaded' | 'failed';

export interface AnafMessage {
    id: string;
    cif: string;
    data_creare: string | null;
    tip: string | null;
    detalii: string | null;
    id_solicitare: string | null;
    first_seen_at: string;
    notified_at: string | null;
    zip_path: string | null;
    zip_status: ZipStatus;
    xml_path: string | null;
    pdf_path: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    invoice_due_date: string | null;
    invoice_total: string | number | null;
    invoice_currency: string | null;
    supplier_name: string | null;
    supplier_cif: string | null;
    customer_name: string | null;
    customer_cif: string | null;
}

export interface InvoiceLine {
    name: string;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    lineTotal: number | null;
    vatPercent: number | null;
}

export interface ParsedInvoice {
    documentType: 'Invoice' | 'CreditNote';
    invoiceNumber: string | null;
    issueDate: string | null;
    dueDate: string | null;
    currency: string | null;
    note: string | null;
    supplier: { name: string | null; cif: string | null; address: string | null };
    customer: { name: string | null; cif: string | null; address: string | null };
    lineExtensionAmount: number | null;
    taxExclusiveAmount: number | null;
    taxInclusiveAmount: number | null;
    payableAmount: number | null;
    taxAmount: number | null;
    lines: InvoiceLine[];
}

export interface AnafStatus {
    configured: boolean;
    cif?: string;
    token?: 'missing' | 'valid' | 'expired';
    stats?: { total: number; byType: Array<{ tip: string | null; n: number }> };
    message?: string;
}

export interface MessageListResponse {
    messages: AnafMessage[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface CuiInfo {
    cui: number | string;
    denumire: string;
    adresa: string | null;
    localitate: string | null;
    judet: string | null;
    codPostal: string | null;
    nrRegCom: string | null;
    codCaen: string | null;
    formaJuridica: string | null;
    stareInregistrare: string | null;
    platitorTva: boolean;
    dataInceputTva: string | null;
    statusInactivi: boolean;
    dataInactivare: string | null;
    statusRoEfactura: boolean;
    telefon: string | null;
}

export interface ReportsBundle {
    topSuppliers: Array<{
        cif: string; name: string; invoice_count: number;
        total_amount: string; last_invoice_date: string | null; currency: string | null;
    }>;
    monthly: Array<{ ym: string; invoice_count: number; total_amount: string; currency: string | null }>;
    summary: Array<{ invoice_count: number; total_amount: string; currency: string | null; unique_suppliers: number }>;
    scadentar: Array<{
        id: string; supplier_name: string | null; supplier_cif: string | null;
        invoice_number: string | null; invoice_date: string;
        invoice_due_date: string | null; computed_due_date: string;
        invoice_total: string; invoice_currency: string | null; days_until_due: number;
    }>;
    totalSupplier: Array<{ total: string; currency: string | null; n: number }>;
}

export const anafApi = {
    status: () => api.get<AnafStatus>('/anaf/status').then(r => r.data),

    listMessages: (params: {
        q?: string; tip?: string; from?: string; to?: string;
        page?: number; limit?: number;
    } = {}) => api.get<MessageListResponse>('/anaf/messages', { params }).then(r => r.data),

    getMessage: (id: string) =>
        api.get<{ message: AnafMessage; invoice: ParsedInvoice | null }>(`/anaf/messages/${id}`)
            .then(r => r.data),

    cuiLookup: (cui: string | number) =>
        api.post<CuiInfo>('/anaf/cui-lookup', { cui }).then(r => r.data),

    checkNow: () =>
        api.post<{ newMessages: number; attachments: { ok: number; failed: number }; invoices: { ok: number; failed: number } }>('/anaf/check-now')
            .then(r => r.data),

    reports: (params: { from?: string; to?: string; months?: number; top?: number; scad?: number } = {}) =>
        api.get<ReportsBundle>('/anaf/reports/all', { params }).then(r => r.data),

    // OAuth
    oauthAuthorizeUrl: '/api/anaf/oauth/authorize',

    // Direct file download URLs
    pdfUrl: (id: string) => `/api/anaf/messages/${id}/pdf`,
    xmlUrl: (id: string) => `/api/anaf/messages/${id}/xml`,
    zipUrl: (id: string) => `/api/anaf/messages/${id}/zip`,
};
