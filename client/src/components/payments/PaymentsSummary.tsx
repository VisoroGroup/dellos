import React from 'react';
import { usePaymentSummary } from '../../services/payments';
import { DollarSign, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';

export default function PaymentsSummary({ darkMode }: { darkMode: boolean }) {
    const { data: summary, isLoading } = usePaymentSummary();

    if (isLoading) {
        return <div className="animate-pulse h-24 bg-gray-200 dark:bg-navy-800 rounded-xl"></div>;
    }

    const formatMoney = (val: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(val || 0);

    const cards = [
        { title: 'Total de platit luna aceasta', value: formatMoney(summary?.toPayThisMonth), icon: DollarSign, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
        { title: 'Rămas de platit', value: formatMoney(summary?.remainingThisMonth), icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
        { title: 'Deja plătit luna aceasta', value: formatMoney(summary?.paidThisMonth), icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
        { title: 'Plăți depășite (Restanțe)', value: formatMoney(summary?.overdueTotal), icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {cards.map((card, idx) => (
                <div key={idx} className={`p-5 rounded-xl border ${darkMode ? 'bg-navy-800/50 border-navy-700' : 'bg-white border-gray-200'} shadow-sm`}>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className={`text-sm font-medium ${darkMode ? 'text-navy-400' : 'text-gray-500'} mb-1`}>{card.title}</p>
                            <h3 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{card.value}</h3>
                        </div>
                        <div className={`p-2 rounded-lg ${card.bg}`}>
                            <card.icon className={`w-5 h-5 ${card.color}`} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
