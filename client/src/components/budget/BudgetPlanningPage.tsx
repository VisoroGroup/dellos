import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBudgetCategories, useBudgetEntries, useBudgetSummary, useUpsertEntry, useAddCategory, useDeleteCategory, BudgetCategory, BudgetEntry } from '../../services/budget';
import { useAuth } from '../../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Plus, Trash2, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Wallet, Target } from 'lucide-react';
import { safeLocalStorage } from '../../utils/storage';

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
const WEEKS = [1, 2, 3, 4, 5];

function formatMoney(val: number, short = false): string {
    if (short && Math.abs(val) >= 1000) {
        return (val / 1000).toFixed(1) + 'k';
    }
    return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

// Inline cell editor
function CellEditor({ value, onSave, isRevenue, darkMode }: { value: number; onSave: (v: number) => void; isRevenue?: boolean; darkMode: boolean }) {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(String(value || ''));

    useEffect(() => { if (!editing) setText(String(value || '')); }, [value, editing]);

    if (editing) {
        return (
            <input
                autoFocus
                type="number"
                value={text}
                onChange={e => setText(e.target.value)}
                onBlur={() => {
                    setEditing(false);
                    const num = parseFloat(text) || 0;
                    if (num !== value) onSave(num);
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { setText(String(value || '')); setEditing(false); }
                }}
                className={`w-full text-right text-xs px-1 py-0.5 rounded border outline-none ${
                    darkMode ? 'bg-navy-800 border-blue-500 text-white' : 'bg-white border-blue-400 text-gray-900'
                }`}
            />
        );
    }

    const displayVal = value || 0;
    const color = displayVal === 0
        ? (darkMode ? 'text-navy-500' : 'text-gray-300')
        : isRevenue
            ? 'text-emerald-400'
            : (darkMode ? 'text-gray-200' : 'text-gray-700');

    return (
        <button
            onClick={() => setEditing(true)}
            className={`w-full text-right text-xs px-1 py-0.5 rounded hover:bg-blue-500/10 transition-colors cursor-text ${color}`}
        >
            {displayVal === 0 ? '—' : formatMoney(displayVal)}
        </button>
    );
}

// Add category modal
function AddCategoryModal({ parentCategory, section, sectionLabel, onClose, darkMode }: {
    parentCategory?: BudgetCategory;
    section: string;
    sectionLabel: string;
    onClose: () => void;
    darkMode: boolean;
}) {
    const [name, setName] = useState('');
    const addCat = useAddCategory();

    const handleAdd = () => {
        if (!name.trim()) return;
        addCat.mutate({
            name: name.trim(),
            section,
            section_label: sectionLabel,
            parent_id: parentCategory?.id,
        }, {
            onSuccess: () => onClose(),
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={`rounded-2xl p-6 w-full max-w-md shadow-2xl ${darkMode ? 'bg-navy-800 text-white' : 'bg-white text-gray-900'}`}>
                <h3 className="text-lg font-bold mb-4">
                    {parentCategory ? `Adaugă subcategorie: ${parentCategory.name}` : `Categorie nouă: ${sectionLabel}`}
                </h3>
                <input
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                    placeholder="Numele categoriei..."
                    className={`w-full px-4 py-3 rounded-xl border text-sm ${
                        darkMode ? 'bg-navy-900 border-navy-600 text-white placeholder-navy-400' : 'bg-gray-50 border-gray-300 text-gray-900'
                    }`}
                />
                <div className="flex gap-2 mt-4 justify-end">
                    <button onClick={onClose} className={`px-4 py-2 rounded-lg text-sm ${darkMode ? 'text-navy-300 hover:bg-navy-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                        Anulează
                    </button>
                    <button
                        onClick={handleAdd}
                        disabled={!name.trim() || addCat.isPending}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                        {addCat.isPending ? 'Se salvează...' : 'Adaugă'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function BudgetPlanningPage() {
    const { user } = useAuth();
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

    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [addCategoryTarget, setAddCategoryTarget] = useState<{ parent?: BudgetCategory; section: string; sectionLabel: string } | null>(null);

    const { data: categories = [] } = useBudgetCategories();
    const { data: entriesData } = useBudgetEntries(year, month);
    const { data: summary } = useBudgetSummary(year, month);
    const upsert = useUpsertEntry();
    const deleteCat = useDeleteCategory();

    // Protect route
    if (user?.role !== 'superadmin') {
        return <Navigate to="/" replace />;
    }

    // Build entry lookup
    const entryMap = new Map<string, BudgetEntry>();
    if (entriesData?.entries) {
        for (const e of entriesData.entries) {
            const key = `${e.category_id}_${e.week ?? 'total'}`;
            entryMap.set(key, e);
        }
    }

    const getEntry = (catId: string, week: number | null): BudgetEntry => {
        const key = `${catId}_${week ?? 'total'}`;
        const e = entryMap.get(key);
        if (!e) return { category_id: catId, year, month, week, planned: 0, actual: 0, currency: 'RON' };
        return { ...e, planned: parseFloat(e.planned as any) || 0, actual: parseFloat(e.actual as any) || 0 };
    };

    const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Cleanup pending save timers on unmount
    useEffect(() => {
        return () => {
            saveTimers.current.forEach(timer => clearTimeout(timer));
            saveTimers.current.clear();
        };
    }, []);

    const handleSave = (catId: string, week: number | null, field: 'planned' | 'actual', value: number) => {
        const key = `${catId}_${week ?? 'total'}_${field}`;
        const prev = saveTimers.current.get(key);
        if (prev) clearTimeout(prev);

        saveTimers.current.set(key, setTimeout(() => {
            saveTimers.current.delete(key);
            const existing = getEntry(catId, week);
            upsert.mutate({
                category_id: catId,
                year,
                month,
                week,
                planned: field === 'planned' ? value : existing.planned,
                actual: field === 'actual' ? value : existing.actual,
            });
        }, 500));
    };

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            next.has(section) ? next.delete(section) : next.add(section);
            return next;
        });
    };

    // Group categories by section
    const sections = new Map<string, { label: string; categories: BudgetCategory[] }>();
    for (const cat of categories) {
        if (!cat.parent_id) {
            const s = sections.get(cat.section) || { label: cat.section_label, categories: [] };
            s.categories.push(cat);
            sections.set(cat.section, s);
        }
    }

    // Calculate weekly totals for a category (sum of children)
    const getCategoryWeekTotal = (cat: BudgetCategory, week: number | null, field: 'planned' | 'actual'): number => {
        if (cat.children && cat.children.length > 0) {
            return cat.children.reduce((sum, child) => sum + getEntry(child.id, week)[field], 0);
        }
        return getEntry(cat.id, week)[field];
    };

    // Calculate section totals
    const getSectionWeekTotal = (sectionCats: BudgetCategory[], week: number | null, field: 'planned' | 'actual'): number => {
        let total = 0;
        for (const cat of sectionCats) {
            if (cat.is_summary_row) continue;
            total += getCategoryWeekTotal(cat, week, field);
        }
        return total;
    };

    return (
        <div className={`min-h-screen p-4 md:p-6 ${darkMode ? 'bg-navy-950 text-white' : 'bg-gray-50 text-gray-900'} transition-colors`}>
            <div className="max-w-full mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold font-outfit tracking-tight">Planificare buget</h1>
                        <p className={`mt-1 text-sm ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>Planificare financiară și monitorizare — {year}</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Year selector */}
                        <select
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value, 10))}
                            className={`px-3 py-2 rounded-xl text-sm font-medium border ${
                                darkMode ? 'bg-navy-800 border-navy-600 text-white' : 'bg-white border-gray-300'
                            }`}
                        >
                            {[2024, 2025, 2026, 2027].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Summary cards */}
                {summary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <SummaryCard icon={TrendingUp} label="Venituri (realizat)" value={summary.revenue_actual} planned={summary.revenue_planned} positive darkMode={darkMode} />
                        <SummaryCard icon={TrendingDown} label="Cheltuieli (realizat)" value={summary.expense_actual} planned={summary.expense_planned} positive={false} darkMode={darkMode} />
                        <SummaryCard icon={Target} label="Rezultat" value={summary.result_actual} planned={summary.result_planned} positive={summary.result_actual >= 0} darkMode={darkMode} />
                        <SummaryCard icon={Wallet} label="Casă" value={summary.cash_balance ?? 0} darkMode={darkMode} />
                    </div>
                )}

                {/* Month tabs */}
                <div className={`flex gap-1 mb-4 overflow-x-auto pb-2 scrollbar-thin ${darkMode ? 'scrollbar-thumb-navy-700' : 'scrollbar-thumb-gray-300'}`}>
                    {MONTHS.map((m, idx) => (
                        <button
                            key={idx}
                            onClick={() => setMonth(idx + 1)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                                month === idx + 1
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                                    : darkMode ? 'text-navy-300 hover:bg-navy-800' : 'text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                {/* Budget Grid */}
                <div className={`rounded-2xl border overflow-x-auto ${darkMode ? 'border-navy-700 bg-navy-900/50' : 'border-gray-200 bg-white'}`}>
                    <table className="w-full min-w-[900px] text-xs">
                        <thead>
                            <tr className={`${darkMode ? 'bg-navy-800/80' : 'bg-gray-50'}`}>
                                <th className={`text-left px-3 py-2.5 font-semibold sticky left-0 z-10 w-64 ${darkMode ? 'bg-navy-800/95' : 'bg-gray-50'}`}>
                                    Categorie
                                </th>
                                {WEEKS.map(w => (
                                    <th key={w} colSpan={2} className={`text-center px-1 py-2.5 font-semibold border-l ${darkMode ? 'border-navy-700' : 'border-gray-200'}`}>
                                        Săpt {w}
                                    </th>
                                ))}
                                <th colSpan={2} className={`text-center px-1 py-2.5 font-bold border-l-2 ${darkMode ? 'border-blue-500/50' : 'border-blue-300'}`}>
                                    {MONTHS[month - 1]} Total
                                </th>
                            </tr>
                            <tr className={`text-[10px] uppercase tracking-wider ${darkMode ? 'text-navy-400 bg-navy-800/40' : 'text-gray-400 bg-gray-50/50'}`}>
                                <th className={`sticky left-0 z-10 ${darkMode ? 'bg-navy-800/95' : 'bg-gray-50'}`}></th>
                                {WEEKS.map(w => (
                                    <React.Fragment key={w}>
                                        <th className={`px-1 py-1 border-l ${darkMode ? 'border-navy-700' : 'border-gray-200'}`}>Plan</th>
                                        <th className="px-1 py-1">Real.</th>
                                    </React.Fragment>
                                ))}
                                <th className={`px-1 py-1 border-l-2 ${darkMode ? 'border-blue-500/50' : 'border-blue-300'}`}>Plan</th>
                                <th className="px-1 py-1">Real.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from(sections.entries()).map(([sectionKey, { label, categories: sectionCats }]) => {
                                const isCollapsed = collapsedSections.has(sectionKey);
                                const isSummarySection = sectionKey === 'osszesito';

                                return (
                                    <React.Fragment key={sectionKey}>
                                        {/* Section header row */}
                                        <tr className={`${
                                            isSummarySection
                                                ? darkMode ? 'bg-blue-900/20' : 'bg-blue-50'
                                                : darkMode ? 'bg-navy-800/60' : 'bg-gray-100/80'
                                        }`}>
                                            <td className={`px-3 py-2 font-bold text-sm sticky left-0 z-10 ${
                                                isSummarySection
                                                    ? darkMode ? 'bg-blue-900/30' : 'bg-blue-50'
                                                    : darkMode ? 'bg-navy-800/80' : 'bg-gray-100'
                                            }`}>
                                                <div className="flex items-center gap-2">
                                                    {!isSummarySection && (
                                                        <button onClick={() => toggleSection(sectionKey)} className="p-0.5 rounded hover:bg-blue-500/20 transition-colors">
                                                            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                        </button>
                                                    )}
                                                    <span>{label}</span>
                                                    {!isSummarySection && (
                                                        <button
                                                            onClick={() => setAddCategoryTarget({ section: sectionKey, sectionLabel: label })}
                                                            className={`ml-auto p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-500/20 ${darkMode ? 'text-navy-400' : 'text-gray-400'}`}
                                                            title="Categorie nouă"
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            {/* Section totals */}
                                            {WEEKS.map(w => {
                                                const planned = getSectionWeekTotal(sectionCats.filter(c => !c.is_summary_row), w, 'planned');
                                                const actual = getSectionWeekTotal(sectionCats.filter(c => !c.is_summary_row), w, 'actual');
                                                return (
                                                    <React.Fragment key={w}>
                                                        <td className={`px-1 py-2 text-right font-semibold border-l ${darkMode ? 'border-navy-700 text-navy-300' : 'border-gray-200 text-gray-600'}`}>
                                                            {planned ? formatMoney(planned) : ''}
                                                        </td>
                                                        <td className={`px-1 py-2 text-right font-semibold ${
                                                            actual > planned ? 'text-red-400' : actual > 0 ? 'text-emerald-400' : darkMode ? 'text-navy-400' : 'text-gray-400'
                                                        }`}>
                                                            {actual ? formatMoney(actual) : ''}
                                                        </td>
                                                    </React.Fragment>
                                                );
                                            })}
                                            <td className={`px-1 py-2 text-right font-bold border-l-2 ${darkMode ? 'border-blue-500/50 text-navy-200' : 'border-blue-300 text-gray-700'}`}>
                                                {formatMoney(WEEKS.reduce((s, w) => s + getSectionWeekTotal(sectionCats.filter(c => !c.is_summary_row), w, 'planned'), 0))}
                                            </td>
                                            <td className={`px-1 py-2 text-right font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                                {formatMoney(WEEKS.reduce((s, w) => s + getSectionWeekTotal(sectionCats.filter(c => !c.is_summary_row), w, 'actual'), 0))}
                                            </td>
                                        </tr>

                                        {/* Category rows */}
                                        {!isCollapsed && sectionCats.map(cat => (
                                            <React.Fragment key={cat.id}>
                                                {/* Parent category row */}
                                                {!cat.is_summary_row && (
                                                    <tr className={`group border-t ${darkMode ? 'border-navy-800 hover:bg-navy-800/30' : 'border-gray-100 hover:bg-gray-50'}`}>
                                                        <td className={`px-3 py-1.5 sticky left-0 z-10 ${darkMode ? 'bg-navy-900/95' : 'bg-white'}`}>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`${cat.children?.length ? 'font-semibold' : 'pl-4'} ${cat.is_revenue ? 'text-emerald-400' : ''}`}>
                                                                    {cat.name}
                                                                </span>
                                                                {cat.children && cat.children.length > 0 && (
                                                                    <button
                                                                        onClick={() => setAddCategoryTarget({ parent: cat, section: cat.section, sectionLabel: cat.section_label })}
                                                                        className={`ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-navy-500 hover:text-blue-400' : 'text-gray-300 hover:text-blue-500'}`}
                                                                        title="Adaugă subcategorie"
                                                                    >
                                                                        <Plus className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                                {!cat.children?.length && (
                                                                    <button
                                                                        onClick={() => { if (confirm(`Sigur dorești să ștergi: "${cat.name}"?`)) deleteCat.mutate(cat.id); }}
                                                                        className={`ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-navy-600 hover:text-red-400' : 'text-gray-300 hover:text-red-500'}`}
                                                                        title="Șterge"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        {WEEKS.map(w => (
                                                            <React.Fragment key={w}>
                                                                <td className={`px-0.5 py-0.5 border-l ${darkMode ? 'border-navy-800' : 'border-gray-100'}`}>
                                                                    {(!cat.children || cat.children.length === 0) ? (
                                                                        <CellEditor value={getEntry(cat.id, w).planned} onSave={v => handleSave(cat.id, w, 'planned', v)} isRevenue={cat.is_revenue} darkMode={darkMode} />
                                                                    ) : (
                                                                        <span className={`block text-right px-1 py-0.5 text-xs font-medium ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>
                                                                            {getCategoryWeekTotal(cat, w, 'planned') ? formatMoney(getCategoryWeekTotal(cat, w, 'planned')) : '—'}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-0.5 py-0.5">
                                                                    {(!cat.children || cat.children.length === 0) ? (
                                                                        <CellEditor value={getEntry(cat.id, w).actual} onSave={v => handleSave(cat.id, w, 'actual', v)} isRevenue={cat.is_revenue} darkMode={darkMode} />
                                                                    ) : (
                                                                        <span className={`block text-right px-1 py-0.5 text-xs font-medium ${
                                                                            getCategoryWeekTotal(cat, w, 'actual') > getCategoryWeekTotal(cat, w, 'planned') ? 'text-red-400' : 'text-emerald-400'
                                                                        }`}>
                                                                            {getCategoryWeekTotal(cat, w, 'actual') ? formatMoney(getCategoryWeekTotal(cat, w, 'actual')) : '—'}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </React.Fragment>
                                                        ))}
                                                        {/* Monthly total for this category */}
                                                        <td className={`px-1 py-0.5 text-right text-xs font-semibold border-l-2 ${darkMode ? 'border-blue-500/50 text-navy-200' : 'border-blue-300 text-gray-600'}`}>
                                                            {formatMoney(WEEKS.reduce((s, w) => s + (cat.children?.length ? getCategoryWeekTotal(cat, w, 'planned') : getEntry(cat.id, w).planned), 0))}
                                                        </td>
                                                        <td className={`px-1 py-0.5 text-right text-xs font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                                            {formatMoney(WEEKS.reduce((s, w) => s + (cat.children?.length ? getCategoryWeekTotal(cat, w, 'actual') : getEntry(cat.id, w).actual), 0))}
                                                        </td>
                                                    </tr>
                                                )}

                                                {/* Children rows */}
                                                {cat.children?.map(child => (
                                                    <tr key={child.id} className={`group border-t ${darkMode ? 'border-navy-800/50 hover:bg-navy-800/20' : 'border-gray-50 hover:bg-gray-50/50'}`}>
                                                        <td className={`pl-8 pr-3 py-1 sticky left-0 z-10 ${darkMode ? 'bg-navy-900/95' : 'bg-white'}`}>
                                                            <div className="flex items-center gap-1">
                                                                <span className={`text-xs ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>{child.name}</span>
                                                                <button
                                                                    onClick={() => { if (confirm(`Sigur dorești să ștergi: "${child.name}"?`)) deleteCat.mutate(child.id); }}
                                                                    className={`ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-navy-600 hover:text-red-400' : 'text-gray-300 hover:text-red-500'}`}
                                                                    title="Șterge"
                                                                >
                                                                    <Trash2 className="w-2.5 h-2.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        {WEEKS.map(w => (
                                                            <React.Fragment key={w}>
                                                                <td className={`px-0.5 py-0.5 border-l ${darkMode ? 'border-navy-800/50' : 'border-gray-50'}`}>
                                                                    <CellEditor value={getEntry(child.id, w).planned} onSave={v => handleSave(child.id, w, 'planned', v)} darkMode={darkMode} />
                                                                </td>
                                                                <td className="px-0.5 py-0.5">
                                                                    <CellEditor value={getEntry(child.id, w).actual} onSave={v => handleSave(child.id, w, 'actual', v)} darkMode={darkMode} />
                                                                </td>
                                                            </React.Fragment>
                                                        ))}
                                                        <td className={`px-1 py-0.5 text-right text-xs border-l-2 ${darkMode ? 'border-blue-500/50 text-navy-300' : 'border-blue-300 text-gray-500'}`}>
                                                            {formatMoney(WEEKS.reduce((s, w) => s + getEntry(child.id, w).planned, 0))}
                                                        </td>
                                                        <td className={`px-1 py-0.5 text-right text-xs ${darkMode ? 'text-navy-200' : 'text-gray-600'}`}>
                                                            {formatMoney(WEEKS.reduce((s, w) => s + getEntry(child.id, w).actual, 0))}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add category modal */}
            {addCategoryTarget && (
                <AddCategoryModal
                    parentCategory={addCategoryTarget.parent}
                    section={addCategoryTarget.section}
                    sectionLabel={addCategoryTarget.sectionLabel}
                    onClose={() => setAddCategoryTarget(null)}
                    darkMode={darkMode}
                />
            )}
        </div>
    );
}

// Summary card component
function SummaryCard({ icon: Icon, label, value, planned, positive, darkMode }: {
    icon: any; label: string; value: number; planned?: number; positive?: boolean; darkMode: boolean;
}) {
    const diff = planned !== undefined ? value - planned : 0;

    return (
        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-navy-800/50 border-navy-700' : 'bg-white border-gray-200'} shadow-sm`}>
            <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${positive ? 'bg-emerald-500/10 text-emerald-400' : positive === false ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <span className={`text-[11px] font-medium ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>{label}</span>
            </div>
            <div className={`text-xl font-bold ${
                positive ? 'text-emerald-400' : positive === false ? 'text-red-400' : darkMode ? 'text-white' : 'text-gray-900'
            }`}>
                {formatMoney(value)} RON
            </div>
            {planned !== undefined && (
                <div className={`text-[10px] mt-1 ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {diff >= 0 ? '+' : ''}{formatMoney(diff)} vs planificat ({formatMoney(planned)})
                </div>
            )}
        </div>
    );
}
