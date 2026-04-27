import React, { useState, useCallback } from 'react';
import { useBankImports, useBankImportDetail, useUploadBankStatement, useRunMatching, useApproveRow, useAssignRow, useSkipRow, useApproveAll, useCompleteImport, BankStatementRow } from '../../services/bankImport';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../hooks/useToast';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Upload, FileSpreadsheet, Check, X, SkipForward, CheckCheck, ArrowRight, Link2, Plus, Zap, ChevronDown, History } from 'lucide-react';

const CATEGORIES = [
    { value: 'stat', label: 'Stat (ANAF, taxe)' },
    { value: 'partener_furnizor', label: 'Partener / Furnizor' },
    { value: 'furnizor_servicii', label: 'Furnizor de servicii' },
    { value: 'furnizor_echipamente', label: 'Furnizor de echipamente' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'salarii', label: 'Salarii' },
    { value: 'incasare_client', label: '↗ Încasare client' },
    { value: 'alte_venituri', label: '↗ Alte venituri' },
];

function formatMoney(val: number) {
    return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
}

export default function BankImportPage() {
    const { user } = useAuth();
    const { darkMode } = useTheme();

    const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    const { data: imports = [] } = useBankImports();
    const upload = useUploadBankStatement();

    if (user?.role !== 'superadmin') return <Navigate to="/" replace />;

    return (
        <div className={`min-h-screen p-4 md:p-8 ${darkMode ? 'bg-navy-950 text-white' : 'bg-gray-50 text-gray-900'} transition-colors`}>
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold font-outfit tracking-tight">Import bancar</h1>
                        <p className={`mt-1 text-sm ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>Încărcare extras bancar și potrivire automată</p>
                    </div>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${
                            darkMode ? 'bg-navy-800 text-navy-300 hover:bg-navy-700' : 'bg-white text-gray-600 hover:bg-gray-100'
                        } border ${darkMode ? 'border-navy-600' : 'border-gray-300'}`}
                    >
                        <History className="w-4 h-4" /> Istoric ({imports.length})
                    </button>
                </div>

                {/* Upload area */}
                {!selectedImportId && (
                    <UploadArea darkMode={darkMode} onUpload={upload} onImportCreated={id => setSelectedImportId(id)} />
                )}

                {/* Import history */}
                {showHistory && !selectedImportId && (
                    <div className="mb-6">
                        <h2 className={`text-lg font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Istoric importuri</h2>
                        <div className="space-y-2">
                            {imports.map(imp => (
                                <div
                                    key={imp.id}
                                    onClick={() => setSelectedImportId(imp.id)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                                        darkMode ? 'bg-navy-800/50 border-navy-700 hover:bg-navy-800' : 'bg-white border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                                            <div>
                                                <div className="font-medium text-sm">{imp.file_name}</div>
                                                <div className={`text-xs ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>
                                                    {imp.bank_account_name} • {imp.currency} • {format(new Date(imp.created_at), 'dd MMM yyyy HH:mm', { locale: ro })}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className={`px-2 py-1 rounded-md font-medium ${
                                                imp.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400'
                                                : imp.status === 'reviewing' ? 'bg-amber-500/10 text-amber-400'
                                                : 'bg-blue-500/10 text-blue-400'
                                            }`}>{imp.status}</span>
                                            <span>{imp.total_transactions} tranzacții</span>
                                            <ArrowRight className="w-4 h-4 text-navy-500" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Import detail / review */}
                {selectedImportId && (
                    <ImportReview
                        importId={selectedImportId}
                        darkMode={darkMode}
                        onBack={() => setSelectedImportId(null)}
                    />
                )}
            </div>
        </div>
    );
}

function UploadArea({ darkMode, onUpload, onImportCreated }: {
    darkMode: boolean;
    onUpload: ReturnType<typeof useUploadBankStatement>;
    onImportCreated: (id: string) => void;
}) {
    const [dragOver, setDragOver] = useState(false);
    const [bankName, setBankName] = useState('Raiffeisen');
    const [currency, setCurrency] = useState('RON');
    const { showToast } = useToast();

    const handleFile = useCallback((file: File) => {
        onUpload.mutate({ file, bank_account_name: bankName, currency }, {
            onSuccess: (data) => onImportCreated(data.import_id),
            onError: (err: any) => {
                const msg = err?.response?.data?.error || err?.message || 'Eroare necunoscută';
                showToast(`Eroare: ${msg}`, 'error');
            },
        });
    }, [bankName, currency, onUpload, onImportCreated, showToast]);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    return (
        <div className="mb-6">
            <div className="flex gap-3 mb-3">
                <select value={bankName} onChange={e => setBankName(e.target.value)}
                    className={`px-3 py-2 rounded-xl text-sm border ${darkMode ? 'bg-navy-800 border-navy-600 text-white' : 'bg-white border-gray-300'}`}>
                    <option value="Raiffeisen">Raiffeisen</option>
                    <option value="Banca Transilvania">Banca Transilvania</option>
                    <option value="BRD">BRD</option>
                    <option value="BCR">BCR</option>
                    <option value="ING">ING</option>
                </select>
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                    className={`px-3 py-2 rounded-xl text-sm border ${darkMode ? 'bg-navy-800 border-navy-600 text-white' : 'bg-white border-gray-300'}`}>
                    <option value="RON">RON</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                </select>
            </div>

            <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
                    dragOver
                        ? 'border-blue-500 bg-blue-500/10'
                        : darkMode ? 'border-navy-600 hover:border-navy-500 bg-navy-800/30' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                }`}
                onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.xlsx,.xls,.csv';
                    input.onchange = (e: any) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
                    input.click();
                }}
            >
                {onUpload.isPending ? (
                    <div className="animate-pulse">
                        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <FileSpreadsheet className="w-6 h-6 text-blue-400 animate-spin" />
                        </div>
                        <p className="font-medium">Se procesează...</p>
                    </div>
                ) : (
                    <>
                        <Upload className={`w-12 h-12 mx-auto mb-4 ${darkMode ? 'text-navy-400' : 'text-gray-400'}`} />
                        <p className="font-medium text-lg mb-1">Trage aici extrasul bancar</p>
                        <p className={`text-sm ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>sau click pentru a încărca (.xlsx, .xls, .csv)</p>
                    </>
                )}
            </div>

            {onUpload.isError && (
                <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    Eroare: {(onUpload.error as any)?.response?.data?.error || 'Eroare necunoscută'}
                </div>
            )}
        </div>
    );
}

function ImportReview({ importId, darkMode, onBack }: { importId: string; darkMode: boolean; onBack: () => void }) {
    const { data, isLoading } = useBankImportDetail(importId);
    const runMatch = useRunMatching();
    const approveRow = useApproveRow(importId);
    const assignRow = useAssignRow(importId);
    const skipRow = useSkipRow(importId);
    const approveAll = useApproveAll();
    const complete = useCompleteImport();
    const [assigningRowId, setAssigningRowId] = useState<string | null>(null);
    const { showToast } = useToast();
    const onMutationError = useCallback((err: any) => {
        const msg = err?.response?.data?.error || err?.message || 'Eroare necunoscută';
        showToast(`Eroare: ${msg}`, 'error');
    }, [showToast]);

    if (isLoading || !data) return <div className="animate-pulse h-64 rounded-xl bg-gray-200 dark:bg-navy-800" />;

    const { import: imp, rows } = data;
    const unmatched = rows.filter(r => r.match_status === 'unmatched');
    const matched = rows.filter(r => r.match_status === 'matched');
    const unapproved = matched.filter(r => !r.approved);

    return (
        <div>
            {/* Top bar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-navy-800' : 'hover:bg-gray-100'}`}>←</button>
                    <div>
                        <h2 className="font-bold text-lg">{imp.file_name}</h2>
                        <div className={`text-xs ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>
                            {imp.bank_account_name} • {imp.currency} • {rows.length} tranzacții
                            {imp.period_start && ` • ${format(new Date(imp.period_start), 'dd MMM', { locale: ro })} – ${format(new Date(imp.period_end), 'dd MMM yyyy', { locale: ro })}`}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                    {imp.status === 'pending' && (
                        <button
                            onClick={() => runMatch.mutate(importId, { onError: onMutationError })}
                            disabled={runMatch.isPending}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
                        >
                            <Zap className="w-4 h-4" /> {runMatch.isPending ? 'Se potrivește...' : 'Potrivire automată'}
                        </button>
                    )}
                    {unapproved.length > 0 && (
                        <button
                            onClick={() => approveAll.mutate(importId, { onError: onMutationError })}
                            disabled={approveAll.isPending}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                            <CheckCheck className="w-4 h-4" /> Aprobă toate ({unapproved.length})
                        </button>
                    )}
                    {imp.status !== 'completed' && unmatched.length === 0 && (
                        <button
                            onClick={() => complete.mutate(importId, { onError: onMutationError })}
                            disabled={complete.isPending}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
                        >
                            <Check className="w-4 h-4" /> Finalizare
                        </button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {[
                    { label: 'Total', val: rows.length, color: 'text-blue-400' },
                    { label: 'Potrivite', val: matched.length, color: 'text-emerald-400' },
                    { label: 'Neprocesate', val: unmatched.length, color: 'text-amber-400' },
                    { label: 'Sărite', val: rows.filter(r => r.match_status === 'skipped').length, color: 'text-navy-400' },
                ].map(s => (
                    <div key={s.label} className={`p-3 rounded-xl border text-center ${darkMode ? 'bg-navy-800/50 border-navy-700' : 'bg-white border-gray-200'}`}>
                        <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                        <div className={`text-[10px] ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Transaction rows */}
            <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'border-navy-700' : 'border-gray-200'}`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className={`${darkMode ? 'bg-navy-800' : 'bg-gray-50'}`}>
                                <th className="text-left px-3 py-2.5 font-semibold">Data</th>
                                <th className="text-left px-3 py-2.5 font-semibold">Descriere / Partener</th>
                                <th className="text-right px-3 py-2.5 font-semibold">Sumă</th>
                                <th className="text-left px-3 py-2.5 font-semibold">Potrivire</th>
                                <th className="text-center px-3 py-2.5 font-semibold w-32">Acțiune</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <TransactionRow
                                    key={row.id}
                                    row={row}
                                    darkMode={darkMode}
                                    onApprove={() => approveRow.mutate(row.id, { onError: onMutationError })}
                                    onSkip={() => skipRow.mutate(row.id, { onError: onMutationError })}
                                    onAssign={() => setAssigningRowId(row.id)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Assign modal */}
            {assigningRowId && (
                <AssignModal
                    row={rows.find(r => r.id === assigningRowId)!}
                    darkMode={darkMode}
                    onClose={() => setAssigningRowId(null)}
                    onAssign={(category, title) => {
                        assignRow.mutate({ rowId: assigningRowId, category, title }, {
                            onSuccess: () => setAssigningRowId(null),
                            onError: onMutationError,
                        });
                    }}
                />
            )}
        </div>
    );
}

function TransactionRow({ row, darkMode, onApprove, onSkip, onAssign }: {
    row: BankStatementRow; darkMode: boolean;
    onApprove: () => void; onSkip: () => void; onAssign: () => void;
}) {
    const isDebit = row.debit !== null && row.debit > 0;
    const amount = isDebit ? row.debit! : row.credit!;

    const statusBg = {
        matched: darkMode ? 'bg-emerald-950/30' : 'bg-emerald-50',
        created: darkMode ? 'bg-blue-950/30' : 'bg-blue-50',
        skipped: darkMode ? 'bg-navy-900/50 opacity-50' : 'bg-gray-50 opacity-50',
        unmatched: darkMode ? 'bg-amber-950/20' : 'bg-amber-50',
    }[row.match_status] || '';

    return (
        <tr className={`border-t ${darkMode ? 'border-navy-800' : 'border-gray-100'} ${statusBg} ${row.approved ? 'opacity-60' : ''}`}>
            <td className="px-3 py-2.5 whitespace-nowrap">
                {row.transaction_date ? format(new Date(row.transaction_date), 'dd MMM', { locale: ro }) : '—'}
            </td>
            <td className="px-3 py-2.5 max-w-xs">
                <div className="font-medium truncate">{row.counterparty || row.description?.substring(0, 60) || '—'}</div>
                {row.counterparty && row.description && (
                    <div className={`text-[10px] truncate ${darkMode ? 'text-navy-500' : 'text-gray-400'}`}>{row.description.substring(0, 80)}</div>
                )}
            </td>
            <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${isDebit ? 'text-red-400' : 'text-emerald-400'}`}>
                {isDebit ? '-' : '+'}{formatMoney(amount)} {row.currency}
            </td>
            <td className="px-3 py-2.5">
                {row.match_status === 'matched' && row.matched_payment_title && (
                    <div className="flex items-center gap-1">
                        <Link2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <span className="truncate text-emerald-400 font-medium">{row.matched_payment_title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            (row.match_confidence || 0) >= 80 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>{row.match_confidence}%</span>
                    </div>
                )}
                {row.match_status === 'created' && <span className="text-blue-400 font-medium">✨ Creat</span>}
                {row.match_status === 'skipped' && <span className={`${darkMode ? 'text-navy-500' : 'text-gray-400'}`}>⏭ Sărit</span>}
                {row.match_status === 'unmatched' && <span className="text-amber-400">⚠ Fără potrivire</span>}
            </td>
            <td className="px-3 py-2.5 text-center">
                {!row.approved && row.match_status !== 'skipped' && (
                    <div className="flex items-center justify-center gap-1">
                        {row.match_status === 'matched' && (
                            <button onClick={onApprove} className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-400" title="Aprobă">
                                <Check className="w-4 h-4" />
                            </button>
                        )}
                        {row.match_status === 'unmatched' && (
                            <button onClick={onAssign} className="p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-400" title="Clasifică">
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={onSkip} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400/60" title="Sări">
                            <SkipForward className="w-4 h-4" />
                        </button>
                    </div>
                )}
                {row.approved && <Check className="w-4 h-4 text-emerald-400 mx-auto" />}
            </td>
        </tr>
    );
}

function AssignModal({ row, darkMode, onClose, onAssign }: {
    row: BankStatementRow; darkMode: boolean;
    onClose: () => void;
    onAssign: (category: string, title?: string) => void;
}) {
    const [category, setCategory] = useState(row.debit ? 'partener_furnizor' : 'incasare_client');
    const [title, setTitle] = useState(row.counterparty || '');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={`rounded-2xl p-6 w-full max-w-md shadow-2xl ${darkMode ? 'bg-navy-800 text-white' : 'bg-white text-gray-900'}`}>
                <h3 className="text-lg font-bold mb-1">Clasificare tranzacție</h3>
                <p className={`text-xs mb-4 ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>
                    {row.debit ? '-' : '+'}{formatMoney(row.debit || row.credit || 0)} {row.currency} — {row.counterparty || row.description?.substring(0, 50)}
                </p>

                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium mb-1 block">Denumire</label>
                        <input value={title} onChange={e => setTitle(e.target.value)}
                            className={`w-full px-4 py-2.5 rounded-xl border text-sm ${darkMode ? 'bg-navy-900 border-navy-600 text-white' : 'bg-gray-50 border-gray-300'}`}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium mb-1 block">Categorie</label>
                        <select value={category} onChange={e => setCategory(e.target.value)}
                            className={`w-full px-4 py-2.5 rounded-xl border text-sm ${darkMode ? 'bg-navy-900 border-navy-600 text-white' : 'bg-gray-50 border-gray-300'}`}>
                            {CATEGORIES.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex gap-2 mt-5 justify-end">
                    <button onClick={onClose} className={`px-4 py-2 rounded-lg text-sm ${darkMode ? 'text-navy-300 hover:bg-navy-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                        Anulează
                    </button>
                    <button
                        onClick={() => onAssign(category, title)}
                        className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600"
                    >
                        Salvează + Crează plată nouă
                    </button>
                </div>
            </div>
        </div>
    );
}
