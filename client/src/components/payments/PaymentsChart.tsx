import React from 'react';
import { usePaymentChart } from '../../services/payments';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function PaymentsChart({ darkMode }: { darkMode: boolean }) {
    const { data: chartData, isLoading } = usePaymentChart();

    if (isLoading) {
        return <div className="animate-pulse h-64 bg-gray-200 dark:bg-navy-800 rounded-xl mb-6"></div>;
    }

    const formatMoney = (val: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(val);

    return (
        <div className={`p-5 rounded-xl border ${darkMode ? 'bg-navy-800/30 border-navy-700' : 'bg-white border-gray-200'} shadow-sm mb-6`}>
            <h3 className={`text-sm font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Istoric Plăți (Ultimele 6 luni)</h3>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#334155' : '#e2e8f0'} vertical={false} />
                        <XAxis 
                            dataKey="month" 
                            stroke={darkMode ? '#94a3b8' : '#64748b'} 
                            fontSize={12} 
                            tickMargin={10} 
                        />
                        <YAxis 
                            stroke={darkMode ? '#94a3b8' : '#64748b'} 
                            fontSize={12} 
                            tickFormatter={formatMoney} 
                        />
                        <Tooltip 
                            formatter={(value: any) => [formatMoney(Number(value)), '']}
                            contentStyle={{ 
                                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                                borderColor: darkMode ? '#334155' : '#e2e8f0',
                                color: darkMode ? '#f8fafc' : '#0f172a'
                            }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', color: darkMode ? '#cbd5e1' : '#475569' }} />
                        <Bar name="Aprobat / Plătit" dataKey="paid" fill="#10B981" radius={[4, 4, 0, 0]} />
                        <Bar name="Neplătit" dataKey="unpaid" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
