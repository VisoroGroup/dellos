import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import {
    useBudgetCategories,
    useBudgetEntries,
    useBudgetSummary,
    useUpsertEntry,
    useAddCategory,
    useDeleteCategory,
    useCopyWeek,
    exportBudget,
    BudgetCategory,
    BudgetEntry,
} from '../../services/budget';
import { useAuth } from '../../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Plus, Trash2, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Target, Copy, Download, Loader2 } from 'lucide-react';
import BudgetSidePanel from './BudgetSidePanel';
import { useGridNav, GridNavApi, GridCellRef } from '../../hooks/useGridNav';
import { useTheme } from '../../contexts/ThemeContext';

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
const WEEKS = [1, 2, 3, 4, 5];
const COL_COUNT = WEEKS.length * 2; // planned + actual per week

function formatMoney(val: number, short = false): string {
    if (short && Math.abs(val) >= 1000) {
        return (val / 1000).toFixed(1) + 'k';
    }
    return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

// Inline cell editor — exposes a `focus()` method via ref so parent grid nav
// can move keyboard focus into this cell. Focusing the cell auto-enters edit mode.
interface CellEditorProps {
    value: number;
    onSave: (v: number) => void;
    isRevenue?: boolean;
    darkMode: boolean;
    row: number;
    col: number;
    gridNav: GridNavApi;
}

const CellEditor = forwardRef<GridCellRef, CellEditorProps>(function CellEditor(
    { value, onSave, isRevenue, darkMode, row, col, gridNav },
    ref,
) {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(String(value || ''));
    const inputRef = useRef<HTMLInputElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => { if (!editing) setText(String(value || '')); }, [value, editing]);

    // Auto-focus the input as soon as we enter edit mode (covers the case
    // where focus came in via grid navigation rather than a click).
    useEffect(() => {
        if (editing) inputRef.current?.focus();
    }, [editing]);

    // Expose focus() to the grid nav. Calling focus enters edit mode; the
    // useEffect above then focuses the input on the next render.
    useImperativeHandle(ref, () => ({
        focus: () => {
            setEditing(true);
            // If already editing, focus the input directly.
            if (inputRef.current) inputRef.current.focus();
        },
    }), []);

    if (editing) {
        return (
            <input
                ref={inputRef}
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
                    if (e.key === 'Escape') {
                        setText(String(value || ''));
                        setEditing(false);
                        return;
                    }
                    // Tab / Enter / arrows → grid nav. handleKeyDown calls
                    // preventDefault as needed; the new cell's focus() will
                    // trigger blur here, which saves.
                    gridNav.handleKeyDown(row, col, e);
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
            ref={buttonRef}
            onClick={() => setEditing(true)}
            className={`w-full text-right text-xs px-1 py-0.5 rounded hover:bg-blue-500/10 transition-colors cursor-text ${color}`}
        >
            {displayVal === 0 ? '—' : formatMoney(displayVal)}
        </button>
    );
});

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

// Modal for copying a week's data into another week (same year/month).
function CopyWeekModal({ year, month, onClose, darkMode }: {
    year: number;
    month: number;
    onClose: () => void;
    darkMode: boolean;
}) {
    const [sourceWeek, setSourceWeek] = useState(1);
    const [targetWeek, setTargetWeek] = useState(2);
    const copy = useCopyWeek();

    const handleCopy = () => {
        if (sourceWeek === targetWeek) return;
        copy.mutate({
            source: { year, month, week: sourceWeek },
            target: { year, month, week: targetWeek },
        }, {
            onSuccess: () => onClose(),
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={`rounded-2xl p-6 w-full max-w-md shadow-2xl ${darkMode ? 'bg-navy-800 text-white' : 'bg-white text-gray-900'}`}>
                <h3 className="text-lg font-bold mb-4">Copiază datele unei săptămâni</h3>
                <p className={`text-xs mb-4 ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>
                    {MONTHS[month - 1]} {year}
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-navy-300' : 'text-gray-600'}`}>Din săptămâna</label>
                        <select
                            value={sourceWeek}
                            onChange={e => setSourceWeek(parseInt(e.target.value, 10))}
                            className={`w-full px-3 py-2 rounded-lg text-sm border ${darkMode ? 'bg-navy-900 border-navy-600 text-white' : 'bg-white border-gray-300'}`}
                        >
                            {WEEKS.map(w => <option key={w} value={w}>Săpt. {w}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-navy-300' : 'text-gray-600'}`}>În săptămâna</label>
                        <select
                            value={targetWeek}
                            onChange={e => setTargetWeek(parseInt(e.target.value, 10))}
                            className={`w-full px-3 py-2 rounded-lg text-sm border ${darkMode ? 'bg-navy-900 border-navy-600 text-white' : 'bg-white border-gray-300'}`}
                        >
                            {WEEKS.map(w => <option key={w} value={w}>Săpt. {w}</option>)}
                        </select>
                    </div>
                </div>
                {sourceWeek === targetWeek && (
                    <p className="text-xs text-amber-400 mt-3">Săptămânile sursă și destinație trebuie să fie diferite.</p>
                )}
                <div className="flex gap-2 mt-5 justify-end">
                    <button onClick={onClose} className={`px-4 py-2 rounded-lg text-sm ${darkMode ? 'text-navy-300 hover:bg-navy-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                        Anulează
                    </button>
                    <button
                        onClick={handleCopy}
                        disabled={sourceWeek === targetWeek || copy.isPending}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                    >
                        {copy.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                        {copy.isPending ? 'Se copiază...' : 'Copiază'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function BudgetPlanningPage() {
    const { user } = useAuth();
    const { darkMode } = useTheme();

    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [addCategoryTarget, setAddCategoryTarget] = useState<{ parent?: BudgetCategory; section: string; sectionLabel: string } | null>(null);
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [exporting, setExporting] = useState(false);

    const { data: categories = [] } = useBudgetCategories();
    const { data: entriesData } = useBudgetEntries(year, month);
    const { data: summaryMonth } = useBudgetSummary(year, month);
    const { data: summaryYear } = useBudgetSummary(year);
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
            if (cat.kind === 'summary') continue;
            total += getCategoryWeekTotal(cat, week, field);
        }
        return total;
    };

    // Cross-section calculated totals (replicate xlsx formulas)
    // Revenue (Valoare facturată) — top-level, kind === 'revenue'
    const getRevenueWeekTotal = (week: number | null, field: 'planned' | 'actual'): number => {
        let total = 0;
        for (const cat of categories) {
            if (cat.parent_id) continue;
            if (cat.kind !== 'revenue') continue;
            total += getCategoryWeekTotal(cat, week, field);
        }
        return total;
    };

    // Deductions (Parteneri + TVA + Rezervă firmă cu sub-categorii)
    const getDeductionWeekTotal = (week: number | null, field: 'planned' | 'actual'): number => {
        let total = 0;
        for (const cat of categories) {
            if (cat.parent_id) continue;
            if (cat.kind !== 'deduction') continue;
            total += getCategoryWeekTotal(cat, week, field);
        }
        return total;
    };

    // Venit corectat = Valoare facturată − Deduceri
    const getAdjustedRevenueWeekTotal = (week: number | null, field: 'planned' | 'actual'): number =>
        getRevenueWeekTotal(week, field) - getDeductionWeekTotal(week, field);

    // Cheltuieli totale (toate categoriile non-revenue, non-deducere, non-summary)
    const getExpenseWeekTotal = (week: number | null, field: 'planned' | 'actual'): number => {
        let total = 0;
        for (const cat of categories) {
            if (cat.parent_id) continue;
            if (cat.kind === 'revenue' || cat.kind === 'deduction' || cat.kind === 'summary') continue;
            total += getCategoryWeekTotal(cat, week, field);
        }
        return total;
    };

    // Rezultatul săptămânii = Venit corectat − Cheltuieli totale
    const getResultWeekTotal = (week: number | null, field: 'planned' | 'actual'): number =>
        getAdjustedRevenueWeekTotal(week, field) - getExpenseWeekTotal(week, field);

    // ---- Build a flat list of editable cells for grid navigation ----
    // A row is editable when it represents a category whose values are
    // entered directly (not aggregated from children, not summary).
    const editableRowIds: string[] = [];
    const sectionEntries = Array.from(sections.entries());
    for (const [sectionKey, { categories: sectionCats }] of sectionEntries) {
        if (collapsedSections.has(sectionKey)) continue;
        for (const cat of sectionCats) {
            if (cat.kind === 'summary') continue;
            if (!cat.children || cat.children.length === 0) {
                editableRowIds.push(cat.id);
            } else {
                for (const child of cat.children) {
                    editableRowIds.push(child.id);
                }
            }
        }
    }
    const rowIndexById = new Map<string, number>();
    editableRowIds.forEach((id, i) => rowIndexById.set(id, i));
    const rowCount = editableRowIds.length;

    const gridNav = useGridNav(rowCount, COL_COUNT);

    const colFor = (week: number, field: 'planned' | 'actual') =>
        (week - 1) * 2 + (field === 'planned' ? 0 : 1);

    // Helper to render an editable cell wired into grid nav.
    const renderCell = (
        catId: string,
        week: number,
        field: 'planned' | 'actual',
        isRevenue: boolean,
    ) => {
        const row = rowIndexById.get(catId);
        if (row === undefined) {
            // Should not happen, but render a plain editor as a safety net.
            return (
                <CellEditor
                    value={getEntry(catId, week)[field]}
                    onSave={v => handleSave(catId, week, field, v)}
                    isRevenue={isRevenue}
                    darkMode={darkMode}
                    row={0}
                    col={colFor(week, field)}
                    gridNav={gridNav}
                />
            );
        }
        const col = colFor(week, field);
        return (
            <CellEditor
                ref={(r) => gridNav.registerCell(row, col, r)}
                value={getEntry(catId, week)[field]}
                onSave={v => handleSave(catId, week, field, v)}
                isRevenue={isRevenue}
                darkMode={darkMode}
                row={row}
                col={col}
                gridNav={gridNav}
            />
        );
    };

    const handleExport = async () => {
        try {
            setExporting(true);
            await exportBudget(year);
        } finally {
            setExporting(false);
        }
    };

    // Year-level totals for the prominent annual strip.
    const annualPlanned = summaryYear?.result_planned ?? 0;
    const annualActual = summaryYear?.result_actual ?? 0;
    const annualToneBg = annualActual > 0
        ? 'bg-emerald-500/15 border-emerald-500/40'
        : annualActual < 0
            ? 'bg-red-500/15 border-red-500/40'
            : (darkMode ? 'bg-navy-800/50 border-navy-700' : 'bg-white border-gray-200');
    const annualToneText = annualActual > 0 ? 'text-emerald-400' : annualActual < 0 ? 'text-red-400' : (darkMode ? 'text-white' : 'text-gray-900');

    return (
        <div className={`min-h-screen p-4 md:p-6 ${darkMode ? 'bg-navy-950 text-white' : 'bg-gray-50 text-gray-900'} transition-colors`}>
            <div className="max-w-full mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold font-outfit tracking-tight">Planificare buget</h1>
                        <p className={`mt-1 text-sm ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>Planificare financiară și monitorizare — {year}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Copy week */}
                        <button
                            onClick={() => setShowCopyModal(true)}
                            className={`px-3 py-2 rounded-xl text-sm font-medium border flex items-center gap-2 transition-colors ${
                                darkMode ? 'bg-navy-800 border-navy-600 text-white hover:bg-navy-700' : 'bg-white border-gray-300 hover:bg-gray-50'
                            }`}
                            title="Copiază datele unei săptămâni în alta"
                        >
                            <Copy className="w-4 h-4" />
                            Copia săpt. anterioară
                        </button>

                        {/* Export CSV */}
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className={`px-3 py-2 rounded-xl text-sm font-medium border flex items-center gap-2 transition-colors disabled:opacity-50 ${
                                darkMode ? 'bg-navy-800 border-navy-600 text-white hover:bg-navy-700' : 'bg-white border-gray-300 hover:bg-gray-50'
                            }`}
                            title="Exportă tot anul ca CSV"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Exportă CSV
                        </button>

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

                {/* Summary cards (3 cards — Casă moved to side panel) */}
                {summaryMonth && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                        <SummaryCard
                            icon={TrendingUp}
                            label="Venit corectat (realizat)"
                            value={summaryMonth.adjusted_revenue_actual}
                            planned={summaryMonth.adjusted_revenue_planned}
                            positive
                            darkMode={darkMode}
                        />
                        <SummaryCard
                            icon={TrendingDown}
                            label="Cheltuieli totale (realizat)"
                            value={summaryMonth.expense_actual}
                            planned={summaryMonth.expense_planned}
                            positive={false}
                            darkMode={darkMode}
                        />
                        <SummaryCard
                            icon={Target}
                            label="Rezultat"
                            value={summaryMonth.result_actual}
                            planned={summaryMonth.result_planned}
                            positive={summaryMonth.result_actual >= 0}
                            darkMode={darkMode}
                        />
                    </div>
                )}

                {/* Annual totals strip — auxiliary KPIs */}
                {summaryYear && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                        <AnnualStat
                            label="Anual planificat (rezultat)"
                            value={summaryYear.result_planned}
                            darkMode={darkMode}
                        />
                        <div className={`p-3 rounded-xl border-2 ${annualToneBg}`}>
                            <div className={`text-[11px] font-medium ${darkMode ? 'text-navy-300' : 'text-gray-500'} mb-1`}>
                                Rezultat anual realizat
                            </div>
                            <div className={`text-xl font-extrabold ${annualToneText}`}>
                                {formatMoney(annualActual)} <span className="text-xs font-normal opacity-70">RON</span>
                            </div>
                            <div className={`text-[10px] mt-1 ${darkMode ? 'text-navy-400' : 'text-gray-400'}`}>
                                vs planificat: {formatMoney(annualPlanned)} RON
                            </div>
                        </div>
                        <AnnualStat
                            label="Medie lunară (realizat)"
                            value={Math.round(annualActual / 12)}
                            darkMode={darkMode}
                        />
                    </div>
                )}

                {/* Main + Aside layout */}
                <div className="flex gap-6 items-start">
                    <main className="flex-1 min-w-0 space-y-4">
                        {/* Month tabs */}
                        <div className={`flex gap-1 overflow-x-auto pb-2 scrollbar-thin ${darkMode ? 'scrollbar-thumb-navy-700' : 'scrollbar-thumb-gray-300'}`}>
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
                                    {sectionEntries.map(([sectionKey, { label, categories: sectionCats }]) => {
                                        const isCollapsed = collapsedSections.has(sectionKey);
                                        const isSummarySection = sectionKey === 'osszesito';
                                        const realCats = sectionCats.filter(c => c.kind !== 'summary');

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
                                                        const planned = getSectionWeekTotal(realCats, w, 'planned');
                                                        const actual = getSectionWeekTotal(realCats, w, 'actual');
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
                                                        {formatMoney(WEEKS.reduce((s, w) => s + getSectionWeekTotal(realCats, w, 'planned'), 0))}
                                                    </td>
                                                    <td className={`px-1 py-2 text-right font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                                        {formatMoney(WEEKS.reduce((s, w) => s + getSectionWeekTotal(realCats, w, 'actual'), 0))}
                                                    </td>
                                                </tr>

                                                {/* Category rows */}
                                                {!isCollapsed && sectionCats.map(cat => (
                                                    <React.Fragment key={cat.id}>
                                                        {/* Parent category row */}
                                                        {cat.kind !== 'summary' && (
                                                            <tr className={`group border-t ${darkMode ? 'border-navy-800 hover:bg-navy-800/30' : 'border-gray-100 hover:bg-gray-50'}`}>
                                                                <td className={`px-3 py-1.5 sticky left-0 z-10 ${darkMode ? 'bg-navy-900/95' : 'bg-white'}`}>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className={`${cat.children?.length ? 'font-semibold' : 'pl-4'} ${cat.kind === 'revenue' ? 'text-emerald-400' : cat.kind === 'deduction' ? 'text-red-300' : ''}`}>
                                                                            {cat.kind === 'deduction' && !cat.children?.length ? '− ' : ''}{cat.name}
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
                                                                                renderCell(cat.id, w, 'planned', cat.kind === 'revenue')
                                                                            ) : (
                                                                                <span className={`block text-right px-1 py-0.5 text-xs font-medium ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>
                                                                                    {getCategoryWeekTotal(cat, w, 'planned') ? formatMoney(getCategoryWeekTotal(cat, w, 'planned')) : '—'}
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-0.5 py-0.5">
                                                                            {(!cat.children || cat.children.length === 0) ? (
                                                                                renderCell(cat.id, w, 'actual', cat.kind === 'revenue')
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

                                                        {/* Children rows — apply deduction styling when child.kind === 'deduction' */}
                                                        {cat.children?.map((child: BudgetCategory) => {
                                                            const childIsDeduction = child.kind === 'deduction';
                                                            return (
                                                                <tr key={child.id} className={`group border-t ${darkMode ? 'border-navy-800/50 hover:bg-navy-800/20' : 'border-gray-50 hover:bg-gray-50/50'}`}>
                                                                    <td className={`pl-8 pr-3 py-1 sticky left-0 z-10 ${darkMode ? 'bg-navy-900/95' : 'bg-white'}`}>
                                                                        <div className="flex items-center gap-1">
                                                                            <span className={`text-xs ${childIsDeduction ? 'text-red-300' : (darkMode ? 'text-navy-300' : 'text-gray-500')}`}>
                                                                                {childIsDeduction ? '− ' : ''}{child.name}
                                                                            </span>
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
                                                                                {renderCell(child.id, w, 'planned', false)}
                                                                            </td>
                                                                            <td className="px-0.5 py-0.5">
                                                                                {renderCell(child.id, w, 'actual', false)}
                                                                            </td>
                                                                        </React.Fragment>
                                                                    ))}
                                                                    <td className={`px-1 py-0.5 text-right text-xs border-l-2 ${darkMode ? 'border-blue-500/50 text-navy-300' : 'border-blue-300 text-gray-500'}`}>
                                                                        {formatMoney(WEEKS.reduce((s, w) => s + getEntry(child.id, w).planned, 0))}
                                                                    </td>
                                                                    <td className={`px-1 py-0.5 text-right text-xs ${childIsDeduction ? 'text-red-300' : (darkMode ? 'text-navy-200' : 'text-gray-600')}`}>
                                                                        {formatMoney(WEEKS.reduce((s, w) => s + getEntry(child.id, w).actual, 0))}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                ))}

                                                {/* Venit corectat — calculated row after "Venituri și deduceri" section */}
                                                {sectionKey === 'venituri' && (
                                                    <CalculatedRow
                                                        label="Venit corectat"
                                                        sublabel="(ce poate fi cheltuit)"
                                                        getValue={getAdjustedRevenueWeekTotal}
                                                        tone="blue"
                                                        darkMode={darkMode}
                                                    />
                                                )}
                                            </React.Fragment>
                                        );
                                    })}

                                    {/* Cheltuieli totale — sum of all expense sections (1-6) */}
                                    <CalculatedRow
                                        label="Cheltuieli totale"
                                        getValue={getExpenseWeekTotal}
                                        tone="amber"
                                        darkMode={darkMode}
                                    />

                                    {/* Rezultatul săptămânii — visual climax */}
                                    <CalculatedRow
                                        label="Rezultatul săptămânii"
                                        sublabel="(Venit corectat − Cheltuieli)"
                                        getValue={getResultWeekTotal}
                                        tone="result"
                                        prominent
                                        darkMode={darkMode}
                                    />
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile: side panel below table */}
                        <div className="lg:hidden">
                            <BudgetSidePanel year={year} month={month} darkMode={darkMode} layout="horizontal" />
                        </div>
                    </main>

                    {/* Desktop: side panel as sticky right rail */}
                    <aside className="hidden lg:block w-80 shrink-0 sticky top-4 self-start space-y-4">
                        <BudgetSidePanel year={year} month={month} darkMode={darkMode} layout="vertical" />
                    </aside>
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

            {/* Copy week modal */}
            {showCopyModal && (
                <CopyWeekModal
                    year={year}
                    month={month}
                    onClose={() => setShowCopyModal(false)}
                    darkMode={darkMode}
                />
            )}
        </div>
    );
}

// Read-only calculated row (Venit corectat / Cheltuieli totale / Rezultatul săptămânii)
// Replicates xlsx formula rows — values cannot be edited, only displayed.
function CalculatedRow({
    label,
    sublabel,
    getValue,
    tone,
    darkMode,
    prominent,
}: {
    label: string;
    sublabel?: string;
    getValue: (week: number | null, field: 'planned' | 'actual') => number;
    tone: 'blue' | 'amber' | 'result';
    darkMode: boolean;
    prominent?: boolean;
}) {
    const totalPlanned = WEEKS.reduce((s, w) => s + getValue(w, 'planned'), 0);
    const totalActual = WEEKS.reduce((s, w) => s + getValue(w, 'actual'), 0);

    // For the prominent (result) row, base the row colour on the actual total.
    const prominentResultPositive = prominent && tone === 'result' && totalActual > 0;
    const prominentResultNegative = prominent && tone === 'result' && totalActual < 0;

    // Color schemes
    let bgClass: string;
    let stickyBg: string;
    let topBorderClass = `border-t-2 ${darkMode ? 'border-navy-700' : 'border-gray-300'}`;

    if (prominentResultPositive) {
        bgClass = 'bg-emerald-500/15 hover:bg-emerald-500/20';
        stickyBg = 'bg-emerald-500/20';
        topBorderClass = 'border-t-2 border-emerald-500';
    } else if (prominentResultNegative) {
        bgClass = 'bg-red-500/15 hover:bg-red-500/20';
        stickyBg = 'bg-red-500/20';
        topBorderClass = 'border-t-2 border-red-500';
    } else if (tone === 'blue') {
        bgClass = darkMode ? 'bg-blue-900/30 hover:bg-blue-900/40' : 'bg-blue-50 hover:bg-blue-100/70';
        stickyBg = darkMode ? 'bg-blue-900/40' : 'bg-blue-50';
    } else if (tone === 'amber') {
        bgClass = darkMode ? 'bg-amber-900/20 hover:bg-amber-900/30' : 'bg-amber-50 hover:bg-amber-100/70';
        stickyBg = darkMode ? 'bg-amber-900/30' : 'bg-amber-50';
    } else {
        bgClass = darkMode ? 'bg-navy-800/80 hover:bg-navy-800' : 'bg-gray-100 hover:bg-gray-150';
        stickyBg = darkMode ? 'bg-navy-800' : 'bg-gray-100';
    }

    const labelColor =
        prominentResultPositive ? 'text-emerald-400' :
        prominentResultNegative ? 'text-red-400' :
        tone === 'blue'  ? (darkMode ? 'text-blue-300'  : 'text-blue-700')  :
        tone === 'amber' ? (darkMode ? 'text-amber-300' : 'text-amber-700') :
                           (darkMode ? 'text-white'     : 'text-gray-900');

    const valueColor = (val: number) => {
        if (tone === 'result') {
            return val > 0 ? 'text-emerald-400' : val < 0 ? 'text-red-400' : darkMode ? 'text-navy-400' : 'text-gray-400';
        }
        if (tone === 'blue') return 'text-blue-400';
        if (tone === 'amber') return 'text-amber-400';
        return darkMode ? 'text-white' : 'text-gray-900';
    };

    const labelSize = prominent ? 'text-base font-extrabold' : 'text-sm font-bold';
    const cellSize = prominent ? 'text-base' : '';

    return (
        <tr className={`${topBorderClass} ${bgClass}`}>
            <td className={`px-3 py-2 sticky left-0 z-10 ${stickyBg}`}>
                <div className={`flex flex-col ${labelColor}`}>
                    <span className={labelSize}>{label}</span>
                    {sublabel && <span className={`text-[10px] font-normal ${darkMode ? 'opacity-70' : 'opacity-60'}`}>{sublabel}</span>}
                </div>
            </td>
            {WEEKS.map(w => {
                const planned = getValue(w, 'planned');
                const actual = getValue(w, 'actual');
                return (
                    <React.Fragment key={w}>
                        <td className={`px-1 py-2 text-right font-semibold border-l ${darkMode ? 'border-navy-700' : 'border-gray-200'} ${valueColor(planned)} ${cellSize}`}>
                            {planned ? formatMoney(planned) : '—'}
                        </td>
                        <td className={`px-1 py-2 text-right font-bold ${valueColor(actual)} ${cellSize}`}>
                            {actual ? formatMoney(actual) : '—'}
                        </td>
                    </React.Fragment>
                );
            })}
            <td className={`px-1 py-2 text-right font-bold border-l-2 ${darkMode ? 'border-blue-500/50' : 'border-blue-300'} ${valueColor(totalPlanned)} ${cellSize}`}>
                {totalPlanned ? formatMoney(totalPlanned) : '—'}
            </td>
            <td className={`px-1 py-2 text-right font-bold ${valueColor(totalActual)} ${cellSize}`}>
                {totalActual ? formatMoney(totalActual) : '—'}
            </td>
        </tr>
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

// Compact annual stat box (auxiliary, flatter than SummaryCard).
function AnnualStat({ label, value, darkMode }: { label: string; value: number; darkMode: boolean }) {
    return (
        <div className={`p-3 rounded-xl border ${darkMode ? 'bg-navy-800/30 border-navy-700' : 'bg-white border-gray-200'}`}>
            <div className={`text-[11px] font-medium mb-1 ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>
                {label}
            </div>
            <div className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {formatMoney(value)} <span className="text-xs font-normal opacity-60">RON</span>
            </div>
        </div>
    );
}
