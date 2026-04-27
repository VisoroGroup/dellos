import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { anafApi } from '../../services/anaf';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function fmt(n: number | string | null | undefined, c?: string | null) {
    if (n == null) return '-';
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (!Number.isFinite(num)) return '-';
    return num.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (c ? ' ' + c : '');
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthsAgoISO(months: number) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
}

export default function RapoartePage() {
    const [params, setParams] = useState({
        from: monthsAgoISO(11),
        to: todayISO(),
        months: 12,
        top: 10,
        scad: 30,
    });

    const { data, isLoading } = useQuery({
        queryKey: ['anaf-reports', params],
        queryFn: () => anafApi.reports(params),
    });

    const summaryTotal = data?.summary.reduce((s, r) => s + parseFloat(r.total_amount), 0) || 0;
    const summaryCount = data?.summary.reduce((s, r) => s + r.invoice_count, 0) || 0;
    const summaryUniqueSup = data?.summary.reduce((s, r) => s + r.unique_suppliers, 0) || 0;

    // Aggregate monthly chart by ym (sum across currencies)
    const chartData = (() => {
        const m: Record<string, { ym: string; count: number; total: number }> = {};
        data?.monthly.forEach(r => {
            if (!m[r.ym]) m[r.ym] = { ym: r.ym, count: 0, total: 0 };
            m[r.ym].count += r.invoice_count;
            m[r.ym].total += parseFloat(r.total_amount);
        });
        return Object.values(m).sort((a, b) => a.ym.localeCompare(b.ym));
    })();

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <p className="text-xs text-navy-500 mb-1">ANAF SPV › Rapoarte</p>
            <h1 className="text-2xl font-bold text-white mb-6">Rapoarte</h1>

            {/* Filters */}
            <div className="bg-navy-800/30 rounded-lg p-3 mb-5 border border-navy-700/30 flex flex-wrap gap-2 items-center">
                <label className="flex items-center gap-2 text-xs text-navy-300">De la
                    <input type="date" value={params.from} onChange={e => setParams(p => ({ ...p, from: e.target.value }))}
                        className="px-2 py-1.5 bg-navy-900/50 border border-navy-700/50 rounded text-sm text-white" />
                </label>
                <label className="flex items-center gap-2 text-xs text-navy-300">Până la
                    <input type="date" value={params.to} onChange={e => setParams(p => ({ ...p, to: e.target.value }))}
                        className="px-2 py-1.5 bg-navy-900/50 border border-navy-700/50 rounded text-sm text-white" />
                </label>
                <label className="flex items-center gap-2 text-xs text-navy-300">Top
                    <input type="number" min={3} max={50} value={params.top}
                        onChange={e => setParams(p => ({ ...p, top: parseInt(e.target.value) || 10 }))}
                        className="w-16 px-2 py-1.5 bg-navy-900/50 border border-navy-700/50 rounded text-sm text-white" />
                </label>
                <label className="flex items-center gap-2 text-xs text-navy-300">Scadențar (zile)
                    <input type="number" min={1} max={365} value={params.scad}
                        onChange={e => setParams(p => ({ ...p, scad: parseInt(e.target.value) || 30 }))}
                        className="w-16 px-2 py-1.5 bg-navy-900/50 border border-navy-700/50 rounded text-sm text-white" />
                </label>
                <label className="flex items-center gap-2 text-xs text-navy-300">Grafic (luni)
                    <input type="number" min={3} max={36} value={params.months}
                        onChange={e => setParams(p => ({ ...p, months: parseInt(e.target.value) || 12 }))}
                        className="w-16 px-2 py-1.5 bg-navy-900/50 border border-navy-700/50 rounded text-sm text-white" />
                </label>
            </div>

            {isLoading && <div className="text-navy-400 py-12 text-center">Se încarcă rapoartele...</div>}

            {data && (
                <>
                    {/* Summary cards */}
                    <h3 className="text-sm font-medium text-white mb-2">Sumar pe perioadă ({params.from} → {params.to})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                        <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30">
                            <div className="text-xs text-navy-400 mb-1">Total facturi primite</div>
                            <div className="text-2xl font-bold text-white">{summaryCount}</div>
                        </div>
                        <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30">
                            <div className="text-xs text-navy-400 mb-1">Furnizori unici</div>
                            <div className="text-2xl font-bold text-white">{summaryUniqueSup}</div>
                        </div>
                        <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30 md:col-span-2">
                            <div className="text-xs text-navy-400 mb-1">Total facturat de furnizori (sumă netă)</div>
                            {data.totalSupplier.length === 0 ? (
                                <div className="text-xl text-navy-500">-</div>
                            ) : (
                                data.totalSupplier.map((t, i) => (
                                    <div key={i}>
                                        <div className="text-2xl font-bold text-white tabular-nums">{fmt(t.total, t.currency || 'RON')}</div>
                                        <div className="text-xs text-navy-500">{t.n} facturi</div>
                                    </div>
                                ))
                            )}
                            <div className="text-xs text-navy-500 italic mt-2">
                                ⓘ Suma totală facturată — pentru "de plătit" e nevoie de marcaj plată/neplată per factură.
                            </div>
                        </div>
                    </div>

                    {/* Monthly chart */}
                    <h3 className="text-sm font-medium text-white mb-2 mt-6">Evoluție lunară (ultimele {params.months} luni)</h3>
                    <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30 mb-6">
                        {chartData.length === 0 ? (
                            <div className="text-center text-navy-500 py-12">Niciun date pentru perioadă</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                    <XAxis dataKey="ym" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6 }}
                                        labelStyle={{ color: '#cbd5e1' }}
                                        formatter={(value, name) => name === 'total' ? [fmt(value as number, 'RON'), 'Sumă'] : [value, 'Nr. facturi']}
                                    />
                                    <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Top suppliers */}
                        <div>
                            <h3 className="text-sm font-medium text-white mb-2">Top {params.top} furnizori</h3>
                            <div className="bg-navy-800/30 rounded-lg border border-navy-700/30 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-navy-900/50 border-b border-navy-700/30">
                                            <th className="px-3 py-2 text-left text-xs text-navy-400 w-8">#</th>
                                            <th className="px-3 py-2 text-left text-xs text-navy-400">Furnizor</th>
                                            <th className="px-3 py-2 text-right text-xs text-navy-400">Fact.</th>
                                            <th className="px-3 py-2 text-right text-xs text-navy-400">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topSuppliers.length === 0 && (
                                            <tr><td colSpan={4} className="px-3 py-6 text-center text-navy-500">Niciun furnizor</td></tr>
                                        )}
                                        {data.topSuppliers.map((s, i) => (
                                            <tr key={i} className="border-b border-navy-800/30">
                                                <td className="px-3 py-2 text-navy-500">{i + 1}</td>
                                                <td className="px-3 py-2">
                                                    <div className="text-white font-medium">{s.name}</div>
                                                    <div className="text-xs text-navy-500">CUI: {s.cif} · ultim: {s.last_invoice_date || '-'}</div>
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-navy-200">{s.invoice_count}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-white font-medium">{fmt(s.total_amount, s.currency || 'RON')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Scadentar */}
                        <div>
                            <h3 className="text-sm font-medium text-white mb-2">Scadențar (urm. {params.scad} zile + restanțe)</h3>
                            <div className="bg-navy-800/30 rounded-lg border border-navy-700/30 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-navy-900/50 border-b border-navy-700/30">
                                            <th className="px-3 py-2 text-left text-xs text-navy-400">Scadența</th>
                                            <th className="px-3 py-2 text-left text-xs text-navy-400">Furnizor</th>
                                            <th className="px-3 py-2 text-left text-xs text-navy-400">Factura</th>
                                            <th className="px-3 py-2 text-right text-xs text-navy-400">Sumă</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.scadentar.length === 0 && (
                                            <tr><td colSpan={4} className="px-3 py-6 text-center text-navy-500">Niciun rând</td></tr>
                                        )}
                                        {data.scadentar.map(s => {
                                            const overdue = s.days_until_due < 0;
                                            const soon = s.days_until_due >= 0 && s.days_until_due <= 7;
                                            const color = overdue ? 'text-red-400' : soon ? 'text-yellow-400' : 'text-navy-300';
                                            const label = overdue
                                                ? `Restant ${Math.abs(s.days_until_due)} zile`
                                                : s.days_until_due === 0 ? 'Astăzi' : `În ${s.days_until_due} zile`;
                                            return (
                                                <tr key={s.id} className="border-b border-navy-800/30">
                                                    <td className="px-3 py-2">
                                                        <div className="text-white font-medium">{s.computed_due_date}</div>
                                                        <div className={`text-xs ${color}`}>{label}</div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="text-navy-200">{s.supplier_name || '-'}</div>
                                                        <div className="text-xs text-navy-500">{s.supplier_cif || ''}</div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Link to={`/anaf/${s.id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                                                            {s.invoice_number || '-'}
                                                        </Link>
                                                        <div className="text-xs text-navy-500">emis: {s.invoice_date}</div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-white font-medium">
                                                        {fmt(s.invoice_total, s.invoice_currency || 'RON')}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="text-xs text-navy-500 italic mt-2">
                                ⓘ Scadența calculată: <code>data emitere + 30 zile</code>, sau <code>DueDate</code> din XML dacă e prezent.
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
