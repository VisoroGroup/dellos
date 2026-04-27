import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { anafApi, AnafMessage } from '../../services/anaf';
import { Search, Filter, Download, FileText, RefreshCw, AlertCircle } from 'lucide-react';

function formatAmount(n: string | number | null, currency?: string | null) {
    if (n == null) return '-';
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (!Number.isFinite(num)) return '-';
    return num.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (currency ? ' ' + currency : '');
}

function tipColor(tip: string | null): string {
    const t = (tip || '').toLowerCase();
    if (t.includes('factura')) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    if (t.includes('mesaj')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (t.includes('eror')) return 'bg-red-500/15 text-red-300 border-red-500/30';
    return 'bg-navy-700/50 text-navy-300 border-navy-600/30';
}

function statusDot(status: string) {
    const colors: Record<string, string> = {
        downloaded: 'bg-emerald-500',
        pending: 'bg-yellow-500',
        failed: 'bg-red-500',
    };
    return <span className={`inline-block w-2 h-2 rounded-full mr-2 ${colors[status] || 'bg-navy-500'}`} />;
}

export default function EFacturiPage() {
    const [filters, setFilters] = useState({ q: '', tip: '', from: '', to: '', page: 1 });

    const { data: status } = useQuery({
        queryKey: ['anaf-status'],
        queryFn: anafApi.status,
        staleTime: 60_000,
    });

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['anaf-messages', filters],
        queryFn: () => anafApi.listMessages(filters),
    });

    const onFilterChange = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v, page: 1 }));

    const tokenStatus = status?.token;
    const showAuthBanner = status?.configured && (tokenStatus === 'missing' || tokenStatus === 'expired');

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <p className="text-xs text-navy-500 mb-1">ANAF SPV › E-Facturi</p>
                    <h1 className="text-2xl font-bold text-white">E-Facturi</h1>
                </div>
                <div className="flex items-center gap-2">
                    {tokenStatus === 'valid' && (
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />Token OK
                        </span>
                    )}
                    <button
                        onClick={() => refetch()}
                        className="px-3 py-2 text-sm bg-navy-800/50 hover:bg-navy-700/50 text-navy-200 rounded-lg flex items-center gap-2 border border-navy-700/30"
                    >
                        <RefreshCw className="w-4 h-4" />Reîmprospăteaza
                    </button>
                </div>
            </div>

            {/* Auth banner if needed */}
            {showAuthBanner && (
                <div className="mb-4 p-4 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm text-orange-200">
                            Token ANAF {tokenStatus === 'expired' ? 'expirat' : 'lipsă'} — necesar pentru a descărca mesaje SPV.
                        </p>
                    </div>
                    <a
                        href="/api/anaf/oauth/authorize"
                        className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm rounded-lg font-medium"
                    >
                        Autentificare ANAF
                    </a>
                </div>
            )}

            {!status?.configured && (
                <div className="mb-4 p-4 rounded-lg bg-navy-800/50 border border-navy-700/30">
                    <p className="text-sm text-navy-300 mb-2">
                        ANAF nu este complet configurat.
                        {status?.cif && <> CIF setat: <code className="text-blue-300">{status.cif}</code>.</>}
                    </p>
                    {status?.missing && status.missing.length > 0 && (
                        <p className="text-sm text-navy-400">
                            Lipsesc: {status.missing.map(v => <code key={v} className="text-orange-300 mr-2">{v}</code>)}
                        </p>
                    )}
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30">
                    <div className="text-xs text-navy-400 mb-1">Total mesaje arhivate</div>
                    <div className="text-2xl font-bold text-white">{status?.stats?.total ?? 0}</div>
                </div>
                <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30">
                    <div className="text-xs text-navy-400 mb-1">Rezultat curent</div>
                    <div className="text-2xl font-bold text-white">{data?.total ?? 0}</div>
                    <div className="text-xs text-navy-500">cu filtrele aplicate</div>
                </div>
                <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30">
                    <div className="text-xs text-navy-400 mb-1">Tipuri</div>
                    <div className="text-sm text-white space-y-0.5">
                        {(status?.stats?.byType || []).map(t => (
                            <div key={t.tip || ''}>{t.tip || '(nedefinit)'}: <strong>{t.n}</strong></div>
                        ))}
                        {(!status?.stats?.byType || status.stats.byType.length === 0) && <span className="text-navy-500">-</span>}
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-navy-800/30 rounded-lg p-3 mb-3 border border-navy-700/30 flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
                    <input
                        type="search"
                        placeholder="Căutare (numar, furnizor, detalii)..."
                        value={filters.q}
                        onChange={e => onFilterChange('q', e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-navy-900/50 border border-navy-700/50 rounded-lg text-sm text-white placeholder-navy-500 focus:border-blue-500 focus:outline-none"
                    />
                </div>
                <select
                    value={filters.tip}
                    onChange={e => onFilterChange('tip', e.target.value)}
                    className="px-3 py-2 bg-navy-900/50 border border-navy-700/50 rounded-lg text-sm text-white"
                >
                    <option value="">Toate tipurile</option>
                    <option value="FACTURA PRIMITA">FACTURA PRIMITA</option>
                    <option value="FACTURA TRIMISA">FACTURA TRIMISA</option>
                    <option value="MESAJ">MESAJ</option>
                    <option value="ERORI FACTURA">ERORI FACTURA</option>
                </select>
                <input type="date" value={filters.from} onChange={e => onFilterChange('from', e.target.value)}
                    className="px-3 py-2 bg-navy-900/50 border border-navy-700/50 rounded-lg text-sm text-white" />
                <input type="date" value={filters.to} onChange={e => onFilterChange('to', e.target.value)}
                    className="px-3 py-2 bg-navy-900/50 border border-navy-700/50 rounded-lg text-sm text-white" />
                <button onClick={() => setFilters({ q: '', tip: '', from: '', to: '', page: 1 })}
                    className="px-3 py-2 bg-navy-700/50 hover:bg-navy-600/50 text-navy-200 text-sm rounded-lg flex items-center gap-1">
                    <Filter className="w-4 h-4" />Reset
                </button>
            </div>

            {/* Table */}
            <div className="bg-navy-800/30 rounded-lg border border-navy-700/30 overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-navy-900/50 border-b border-navy-700/30">
                            <th className="px-4 py-3 text-left text-xs font-medium text-navy-400 uppercase">Data</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-navy-400 uppercase">Tip</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-navy-400 uppercase">Furnizor / Detalii</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-navy-400 uppercase">Nr. factura</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-navy-400 uppercase">Suma</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-navy-400 uppercase">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-navy-400 uppercase">Acțiuni</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr><td colSpan={7} className="px-4 py-12 text-center text-navy-400">Se încarcă...</td></tr>
                        )}
                        {!isLoading && data?.messages.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-12 text-center text-navy-500">
                                <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
                                <p>Niciun mesaj găsit</p>
                                <p className="text-xs mt-1">Cron-ul descarcă mesajele automat. Verifică setările sau autentificarea ANAF.</p>
                            </td></tr>
                        )}
                        {data?.messages.map((m: AnafMessage) => (
                            <tr key={m.id} className="border-b border-navy-800/30 hover:bg-navy-700/20">
                                <td className="px-4 py-3 text-navy-300 text-xs">{m.data_creare || '-'}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded border ${tipColor(m.tip)}`}>
                                        {m.tip || '-'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    {m.supplier_name ? (
                                        <>
                                            <div className="font-medium text-white">{m.supplier_name}</div>
                                            {m.supplier_cif && <div className="text-xs text-navy-500">CUI: {m.supplier_cif}</div>}
                                        </>
                                    ) : (
                                        <span className="text-navy-500">{m.detalii || '-'}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-navy-200">{m.invoice_number || '-'}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-white font-medium">
                                    {formatAmount(m.invoice_total, m.invoice_currency)}
                                </td>
                                <td className="px-4 py-3 text-xs text-navy-300">
                                    {statusDot(m.zip_status)}
                                    {m.zip_status === 'downloaded' && m.pdf_path ? 'PDF gata'
                                        : m.zip_status === 'downloaded' ? 'ZIP descărcat'
                                        : m.zip_status === 'failed' ? 'Eșuat'
                                        : 'În așteptare'}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex gap-1.5">
                                        <Link to={`/anaf/${m.id}`}
                                            className="px-2 py-1 bg-navy-700/50 hover:bg-navy-600/50 text-xs text-navy-200 rounded">
                                            Detalii
                                        </Link>
                                        {m.pdf_path && (
                                            <a href={anafApi.pdfUrl(m.id)} target="_blank" rel="noreferrer"
                                                className="px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-xs text-blue-300 rounded flex items-center gap-1">
                                                <Download className="w-3 h-3" />PDF
                                            </a>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                        disabled={filters.page <= 1}
                        onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                        className="px-3 py-1.5 bg-navy-800/50 hover:bg-navy-700/50 disabled:opacity-30 text-sm text-navy-200 rounded">
                        ← Anterior
                    </button>
                    <span className="text-sm text-navy-400">Pagina {filters.page} / {data.totalPages}</span>
                    <button
                        disabled={filters.page >= data.totalPages}
                        onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                        className="px-3 py-1.5 bg-navy-800/50 hover:bg-navy-700/50 disabled:opacity-30 text-sm text-navy-200 rounded">
                        Următor →
                    </button>
                </div>
            )}
        </div>
    );
}
