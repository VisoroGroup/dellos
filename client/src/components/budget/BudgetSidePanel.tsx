import React, { useState } from 'react';
import { Plus, Trash2, Check, Wallet, AlertCircle, Receipt, Clock } from 'lucide-react';
import {
    OutstandingType,
    OutstandingItem,
    useOutstandingItems,
    useAddOutstanding,
    useUpdateOutstanding,
    useDeleteOutstanding,
    useCashBalance,
    useUpsertCashBalance,
} from '../../services/budget';

function formatMoney(val: number): string {
    return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

interface SidePanelProps {
    year: number;
    month: number;
    darkMode: boolean;
    layout?: 'horizontal' | 'vertical';
}

// Generic outstanding card (Creanțe / Datorii / Prestate nefacturate)
function OutstandingCard({
    type, title, icon: Icon, color, year, month, darkMode,
}: {
    type: OutstandingType;
    title: string;
    icon: any;
    color: 'emerald' | 'red' | 'amber';
    year: number;
    month: number;
    darkMode: boolean;
}) {
    const { data: items = [] } = useOutstandingItems(type);
    const addItem = useAddOutstanding();
    const updateItem = useUpdateOutstanding();
    const deleteItem = useDeleteOutstanding();

    const [adding, setAdding] = useState(false);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [counterparty, setCounterparty] = useState('');

    const total = items.reduce((s, i) => s + (i.amount || 0), 0);

    const colorClasses = {
        emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
        red:     { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
        amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
    }[color];

    const buttonClasses = {
        emerald: 'bg-emerald-500 hover:bg-emerald-600',
        red: 'bg-red-500 hover:bg-red-600',
        amber: 'bg-amber-500 hover:bg-amber-600',
    }[color];

    const handleAdd = () => {
        const amt = parseFloat(amount);
        if (!description.trim() || !amt) return;
        addItem.mutate({
            type,
            description: description.trim(),
            amount: amt,
            counterparty: counterparty.trim() || undefined,
            year,
            month,
        }, {
            onSuccess: () => {
                setDescription('');
                setAmount('');
                setCounterparty('');
                setAdding(false);
            },
        });
    };

    return (
        <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-navy-900/50 border-navy-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${colorClasses.bg} ${colorClasses.text}`}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-semibold">{title}</span>
                </div>
                <button
                    onClick={() => setAdding(true)}
                    className={`p-1 rounded-md transition-colors hover:${colorClasses.bg} ${darkMode ? 'text-navy-400' : 'text-gray-400'}`}
                    title="Adaugă"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            <div className={`text-2xl font-bold mb-3 ${colorClasses.text}`}>
                {formatMoney(total)} <span className="text-xs font-normal opacity-60">RON</span>
            </div>

            {adding && (
                <div className={`p-3 rounded-xl mb-3 space-y-2 ${darkMode ? 'bg-navy-800/50' : 'bg-gray-50'}`}>
                    <input
                        autoFocus
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Descriere..."
                        className={`w-full px-3 py-1.5 rounded-lg text-xs border ${darkMode ? 'bg-navy-900 border-navy-600 text-white' : 'bg-white border-gray-300'}`}
                    />
                    <input
                        value={counterparty}
                        onChange={e => setCounterparty(e.target.value)}
                        placeholder="Partener (opțional)"
                        className={`w-full px-3 py-1.5 rounded-lg text-xs border ${darkMode ? 'bg-navy-900 border-navy-600 text-white' : 'bg-white border-gray-300'}`}
                    />
                    <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="Sumă (RON)"
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                        className={`w-full px-3 py-1.5 rounded-lg text-xs border ${darkMode ? 'bg-navy-900 border-navy-600 text-white' : 'bg-white border-gray-300'}`}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setAdding(false); setDescription(''); setAmount(''); setCounterparty(''); }}
                            className={`flex-1 px-3 py-1.5 rounded-lg text-xs ${darkMode ? 'text-navy-300 hover:bg-navy-700' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                            Anulează
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={!description.trim() || !amount || addItem.isPending}
                            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white ${buttonClasses} disabled:opacity-50`}
                        >
                            Adaugă
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {items.length === 0 && !adding && (
                    <div className={`text-xs italic py-2 ${darkMode ? 'text-navy-500' : 'text-gray-400'}`}>
                        Niciun element
                    </div>
                )}
                {items.map(item => (
                    <OutstandingItemRow
                        key={item.id}
                        item={item}
                        darkMode={darkMode}
                        onResolve={() => updateItem.mutate({ id: item.id, is_resolved: true })}
                        onDelete={() => { if (confirm(`Ștergi: "${item.description}"?`)) deleteItem.mutate(item.id); }}
                    />
                ))}
            </div>
        </div>
    );
}

function OutstandingItemRow({
    item, darkMode, onResolve, onDelete,
}: {
    item: OutstandingItem;
    darkMode: boolean;
    onResolve: () => void;
    onDelete: () => void;
}) {
    return (
        <div className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${darkMode ? 'hover:bg-navy-800/50' : 'hover:bg-gray-50'}`}>
            <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.description}</div>
                {item.counterparty && (
                    <div className={`text-[10px] truncate ${darkMode ? 'text-navy-400' : 'text-gray-400'}`}>
                        {item.counterparty}
                    </div>
                )}
            </div>
            <div className="font-semibold whitespace-nowrap">{formatMoney(item.amount)}</div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={onResolve} className={`p-0.5 rounded hover:bg-emerald-500/20 ${darkMode ? 'text-navy-400 hover:text-emerald-400' : 'text-gray-400 hover:text-emerald-500'}`} title="Marchează rezolvat">
                    <Check className="w-3 h-3" />
                </button>
                <button onClick={onDelete} className={`p-0.5 rounded hover:bg-red-500/20 ${darkMode ? 'text-navy-400 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`} title="Șterge">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}

// Cash balance card (Casă)
function CashBalanceCard({ year, month, darkMode }: { year: number; month: number; darkMode: boolean }) {
    const { data: balances = [] } = useCashBalance(year);
    const upsert = useUpsertCashBalance();

    // Latest balance for the current month, fall back to most recent
    const latest = balances
        .filter(b => b.month <= month)
        .sort((a, b) => b.month - a.month || (b.week || 0) - (a.week || 0))[0];

    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');

    const handleSave = () => {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        upsert.mutate({ year, month, week: null, balance: num }, {
            onSuccess: () => { setEditing(false); setValue(''); },
        });
    };

    return (
        <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-navy-900/50 border-navy-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                        <Wallet className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-semibold">Numerar</span>
                </div>
                {!editing && (
                    <button
                        onClick={() => { setEditing(true); setValue(String(latest?.balance ?? '')); }}
                        className={`p-1 rounded-md transition-colors hover:bg-blue-500/10 ${darkMode ? 'text-navy-400' : 'text-gray-400'}`}
                        title="Actualizează"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                )}
            </div>

            {editing ? (
                <div className="space-y-2">
                    <input
                        autoFocus
                        type="number"
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                        placeholder="Sold curent"
                        className={`w-full px-3 py-2 rounded-lg text-sm border ${darkMode ? 'bg-navy-900 border-navy-600 text-white' : 'bg-white border-gray-300'}`}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => setEditing(false)}
                            className={`flex-1 px-3 py-1.5 rounded-lg text-xs ${darkMode ? 'text-navy-300 hover:bg-navy-700' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                            Anulează
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600"
                        >
                            Salvează
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="text-2xl font-bold text-blue-400">
                        {formatMoney(latest?.balance ?? 0)} <span className="text-xs font-normal opacity-60">RON</span>
                    </div>
                    {latest && (
                        <div className={`text-[10px] mt-1 ${darkMode ? 'text-navy-400' : 'text-gray-400'}`}>
                            Actualizat: {new Date(latest.year, latest.month - 1).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default function BudgetSidePanel({ year, month, darkMode, layout = 'vertical' }: SidePanelProps) {
    const containerClass = layout === 'vertical'
        ? 'flex flex-col gap-4'
        : 'grid grid-cols-1 md:grid-cols-2 gap-4';
    return (
        <div className={containerClass}>
            <CashBalanceCard year={year} month={month} darkMode={darkMode} />
            <OutstandingCard
                type="creanta"
                title="Creanțe"
                icon={Receipt}
                color="emerald"
                year={year}
                month={month}
                darkMode={darkMode}
            />
            <OutstandingCard
                type="datorie"
                title="Datorii"
                icon={AlertCircle}
                color="red"
                year={year}
                month={month}
                darkMode={darkMode}
            />
            <OutstandingCard
                type="prestat_nefacturat"
                title="Prestate nefacturate"
                icon={Clock}
                color="amber"
                year={year}
                month={month}
                darkMode={darkMode}
            />
        </div>
    );
}
