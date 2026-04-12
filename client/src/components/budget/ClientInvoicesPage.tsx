import React, { useState, useEffect } from 'react';
import { useClientInvoices, useInvoiceSummary, useCreateInvoice, useMarkInvoicePaid, useMarkInvoiceUnpaid, useDeleteInvoice, ClientInvoice } from '../../services/clientInvoices';
import { useAuth } from '../../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Plus, FileText, Check, X, Trash2, Search, DollarSign, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { safeLocalStorage } from '../../utils/storage';
import { useToast } from '../../hooks/useToast';

function formatMoney(val: number, currency = 'RON') {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency, minimumFractionDigits: 0 }).format(val);
}

export default function ClientInvoicesPage() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [darkMode, setDarkMode] = useState(() => {
        const saved = safeLocalStorage.get('dark-mode');
        return saved === null ? true : saved === 'true';
    });
    useEffect(() => {
        let mounted = true;
        const observer = new MutationObserver(() => { if (mounted) setDarkMode(document.documentElement.classList.contains('dark')); });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => { mounted = false; observer.disconnect(); };
    }, []);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [showForm, setShowForm] = useState(false);

    const { data: invoices = [], isLoading } = useClientInvoices({
        search: search || undefined,
        is_paid: filter === 'all' ? undefined : filter === 'paid' ? 'true' : 'false',
    });
    const { data: summary } = useInvoiceSummary();
    const markPaid = useMarkInvoicePaid();
    const markUnpaid = useMarkInvoiceUnpaid();
    const deleteInv = useDeleteInvoice();

    if (user?.role !== 'superadmin') return <Navigate to="/" replace />;

    return (
        <div className={`min-h-screen p-4 md:p-8 ${darkMode ? 'bg-navy-950 text-white' : 'bg-gray-50 text-gray-900'} transition-colors`}>
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold font-outfit tracking-tight">Facturi clienți</h1>
                        <p className={`mt-1 text-sm ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>Evidența facturilor emise și a încasărilor</p>
                    </div>
                    <button
                        onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white shadow-lg transition-all hover:-translate-y-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/25"
                    >
                        <Plus className="w-5 h-5" /> Factură nouă
                    </button>
                </div>

                {/* Summary cards */}
                {summary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-navy-800/50 border-navy-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 rounded-lg bg-blue-500/10"><FileText className="w-4 h-4 text-blue-400" /></div>
                                <span className={`text-[11px] font-medium ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>Total</span>
                            </div>
                            <div className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{summary.total}</div>
                        </div>
                        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-navy-800/50 border-navy-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 rounded-lg bg-amber-500/10"><Clock className="w-4 h-4 text-amber-400" /></div>
                                <span className={`text-[11px] font-medium ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>Neachitate</span>
                            </div>
                            <div className="text-xl font-bold text-amber-400">{formatMoney(summary.unpaid_total)}</div>
                            <div className={`text-[10px] ${darkMode ? 'text-navy-400' : 'text-gray-400'}`}>{summary.unpaid_count} facturi</div>
                        </div>
                        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-navy-800/50 border-navy-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 rounded-lg bg-emerald-500/10"><CheckCircle2 className="w-4 h-4 text-emerald-400" /></div>
                                <span className={`text-[11px] font-medium ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>Achitate</span>
                            </div>
                            <div className="text-xl font-bold text-emerald-400">{formatMoney(summary.paid_total)}</div>
                            <div className={`text-[10px] ${darkMode ? 'text-navy-400' : 'text-gray-400'}`}>{summary.paid_count} facturi</div>
                        </div>
                        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-navy-800/50 border-navy-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 rounded-lg bg-purple-500/10"><DollarSign className="w-4 h-4 text-purple-400" /></div>
                                <span className={`text-[11px] font-medium ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>Valoare totală</span>
                            </div>
                            <div className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{formatMoney(summary.grand_total)}</div>
                        </div>
                    </div>
                )}

                {/* Filter bar */}
                <div className="flex flex-col md:flex-row gap-3 mb-4">
                    <div className={`flex-1 relative`}>
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-navy-400' : 'text-gray-400'}`} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Caută client, număr factură..."
                            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm ${
                                darkMode ? 'bg-navy-800 border-navy-600 text-white placeholder-navy-400' : 'bg-white border-gray-300 placeholder-gray-400'
                            }`}
                        />
                    </div>
                    <div className="flex gap-1">
                        {(['all', 'unpaid', 'paid'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                                    filter === f
                                        ? 'bg-blue-500 text-white'
                                        : darkMode ? 'text-navy-300 hover:bg-navy-800' : 'text-gray-500 hover:bg-gray-100'
                                }`}
                            >
                                {f === 'all' ? 'Toate' : f === 'unpaid' ? 'Neachitate' : 'Achitate'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Invoice list */}
                {isLoading ? (
                    <div className="animate-pulse h-64 rounded-xl bg-gray-200 dark:bg-navy-800" />
                ) : invoices.length === 0 ? (
                    <div className={`p-10 text-center rounded-xl border ${darkMode ? 'border-navy-700 bg-navy-800/30' : 'border-gray-200 bg-white'}`}>
                        <FileText className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                        <h3 className="text-lg font-medium">Nicio factură</h3>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {invoices.map(inv => (
                            <InvoiceRow
                                key={inv.id}
                                invoice={inv}
                                darkMode={darkMode}
                                onMarkPaid={id => markPaid.mutate({ id }, { onError: () => showToast('Eroare la marcarea plății', 'error') })}
                                onMarkUnpaid={id => markUnpaid.mutate(id, { onError: () => showToast('Eroare la anulare', 'error') })}
                                onDelete={id => { if (confirm('Sigur dorești să ștergi?')) deleteInv.mutate(id, { onError: () => showToast('Eroare la ștergere', 'error') }); }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {showForm && <InvoiceFormModal onClose={() => setShowForm(false)} darkMode={darkMode} />}
        </div>
    );
}

function InvoiceRow({ invoice, darkMode, onMarkPaid, onMarkUnpaid, onDelete }: {
    invoice: ClientInvoice; darkMode: boolean;
    onMarkPaid: (id: string) => void;
    onMarkUnpaid: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const isOverdue = !invoice.is_paid && invoice.due_date && new Date(invoice.due_date) < new Date();

    return (
        <div className={`group p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all ${
            invoice.is_paid
                ? darkMode ? 'bg-navy-900/40 border-navy-700/50 opacity-70' : 'bg-gray-50 border-gray-200 opacity-70'
                : isOverdue
                    ? darkMode ? 'bg-red-950/30 border-red-500/50' : 'bg-red-50 border-red-300'
                    : darkMode ? 'bg-navy-800/50 border-navy-700' : 'bg-white border-gray-200'
        }`}>
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    {invoice.is_paid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isOverdue ? (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                    ) : (
                        <Clock className="w-4 h-4 text-amber-400" />
                    )}
                    <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{invoice.client_name}</span>
                    {invoice.invoice_number && (
                        <span className={`text-xs px-2 py-0.5 rounded-md ${darkMode ? 'bg-navy-700 text-navy-300' : 'bg-gray-100 text-gray-500'}`}>
                            {invoice.invoice_number}
                        </span>
                    )}
                </div>
                <div className={`text-xs space-x-3 ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>
                    <span>Emis: {format(new Date(invoice.issued_date), 'dd MMM yyyy', { locale: ro })}</span>
                    {invoice.due_date && <span>• Scadent: {format(new Date(invoice.due_date), 'dd MMM yyyy', { locale: ro })}</span>}
                    {invoice.is_paid && invoice.paid_date && <span className="text-emerald-400">• Achitat: {format(new Date(invoice.paid_date), 'dd MMM yyyy', { locale: ro })}</span>}
                </div>
                {invoice.notes && <p className={`text-xs mt-1 ${darkMode ? 'text-navy-500' : 'text-gray-400'}`}>{invoice.notes}</p>}
            </div>

            <div className="flex items-center gap-3">
                <div className="text-right">
                    <div className={`text-lg font-black ${invoice.is_paid ? 'text-emerald-400' : darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {formatMoney(invoice.amount, invoice.currency)}
                    </div>
                    <div className={`text-[10px] ${darkMode ? 'text-navy-500' : 'text-gray-400'}`}>{invoice.currency}</div>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {invoice.is_paid ? (
                        <button onClick={() => onMarkUnpaid(invoice.id)} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-400" title="Anulează">
                            <X className="w-4 h-4" />
                        </button>
                    ) : (
                        <button onClick={() => onMarkPaid(invoice.id)} className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-400" title="Achitat">
                            <Check className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={() => onDelete(invoice.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400" title="Șterge">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function InvoiceFormModal({ onClose, darkMode }: { onClose: () => void; darkMode: boolean }) {
    const [form, setForm] = useState({ client_name: '', invoice_number: '', amount: '', currency: 'RON', issued_date: new Date().toISOString().split('T')[0], due_date: '', notes: '' });
    const create = useCreateInvoice();
    const { showToast } = useToast();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        create.mutate({
            ...form,
            amount: parseFloat(form.amount) as any,
        }, {
            onSuccess: () => onClose(),
            onError: () => showToast('Eroare la salvarea facturii', 'error'),
        });
    };

    const inputClass = `w-full px-4 py-2.5 rounded-xl border text-sm ${darkMode ? 'bg-navy-900 border-navy-600 text-white placeholder-navy-400' : 'bg-gray-50 border-gray-300'}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className={`rounded-2xl p-6 w-full max-w-lg shadow-2xl ${darkMode ? 'bg-navy-800 text-white' : 'bg-white text-gray-900'}`}>
                <h3 className="text-lg font-bold mb-4">Factură nouă client</h3>

                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium mb-1 block">Numele clientului *</label>
                        <input required value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Ex. Client SRL" className={inputClass} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium mb-1 block">Număr factură</label>
                            <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="FAC-2025-001" className={inputClass} />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1 block">Monedă</label>
                            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className={inputClass}>
                                <option value="RON">RON</option>
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium mb-1 block">Sumă *</label>
                        <input required type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={inputClass} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium mb-1 block">Data emiterii *</label>
                            <input required type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))} className={inputClass} />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1 block">Termen de plată</label>
                            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputClass} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium mb-1 block">Observații</label>
                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputClass} />
                    </div>
                </div>

                <div className="flex gap-2 mt-5 justify-end">
                    <button type="button" onClick={onClose} className={`px-4 py-2 rounded-lg text-sm ${darkMode ? 'text-navy-300 hover:bg-navy-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                        Anulează
                    </button>
                    <button type="submit" disabled={create.isPending} className="px-5 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
                        {create.isPending ? 'Se salvează...' : 'Salvează factura'}
                    </button>
                </div>
            </form>
        </div>
    );
}
