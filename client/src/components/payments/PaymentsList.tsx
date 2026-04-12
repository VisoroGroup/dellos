import React from 'react';
import { PaymentWithDetails, PAYMENT_CATEGORIES } from '../../types';
import PaymentBadge, { getPaymentUrgency } from './PaymentBadge';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { FileText, MessageSquare, Repeat } from 'lucide-react';

interface PaymentsListProps {
    payments: PaymentWithDetails[];
    isLoading: boolean;
    darkMode: boolean;
    onPaymentClick: (id: string) => void;
}

export default function PaymentsList({ payments, isLoading, darkMode, onPaymentClick }: PaymentsListProps) {
    if (isLoading) {
        return <div className="animate-pulse h-96 bg-gray-200 dark:bg-navy-800 rounded-xl"></div>;
    }

    if (!payments || payments.length === 0) {
        return (
            <div className={`p-10 text-center rounded-xl border ${darkMode ? 'border-navy-700 bg-navy-800/30' : 'border-gray-200 bg-white'}`}>
                <FileText className="w-12 h-12 mx-auto text-gray-400 dark:text-navy-500 mb-3" />
                <h3 className="text-lg font-medium dark:text-white text-gray-900">Nu există plăți</h3>
                <p className="text-gray-500 dark:text-navy-400 mt-1">Nu s-au găsit plăți care să corespundă filtrelor.</p>
            </div>
        );
    }

    const formatMoney = (val: number | string) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(parseFloat(val as string));

    return (
        <div className="space-y-3">
            {payments.map(payment => {
                const urgency = getPaymentUrgency(payment.due_date, payment.status);
                const categoryConf = PAYMENT_CATEGORIES[payment.category as keyof typeof PAYMENT_CATEGORIES];
                
                // Color coding for the row background
                let rowBg = darkMode ? 'bg-navy-800/50' : 'bg-white';
                let borderColor = darkMode ? 'border-navy-700/50' : 'border-gray-200';
                
                if (payment.status !== 'platit') {
                    if (urgency.state === 'overdue') {
                        rowBg = darkMode ? 'bg-red-950/40' : 'bg-red-50';
                        borderColor = 'border-red-500 border-l-4';
                    } else if (urgency.state === 'today') {
                        rowBg = darkMode ? 'bg-orange-950/40' : 'bg-orange-50';
                        borderColor = 'border-orange-500 border-l-4';
                    } else if (urgency.state === 'tomorrow' || urgency.state === 'week') {
                        rowBg = darkMode ? 'bg-amber-950/20' : 'bg-yellow-50/50';
                    }
                } else {
                    rowBg = darkMode ? 'bg-navy-900/40 opacity-75' : 'bg-gray-50 opacity-75';
                }

                return (
                    <div 
                        key={payment.id} 
                        onClick={() => onPaymentClick(payment.id)}
                        className={`group p-4 rounded-xl border ${borderColor} ${rowBg} hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4`}
                    >
                        <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4">
                            <div className="w-40 flex-shrink-0">
                                <PaymentBadge dueDate={payment.due_date} status={payment.status} />
                            </div>
                            
                            <div className="flex-1">
                                <h4 className={`text-base font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'} group-hover:text-blue-500 transition-colors`}>
                                    {payment.title}
                                </h4>
                                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-navy-300">
                                    <span className="px-2 py-0.5 rounded-md" style={{ backgroundColor: `${categoryConf?.color}15`, color: categoryConf?.color }}>
                                        {categoryConf?.label || payment.category}
                                    </span>
                                    {payment.beneficiary_name && (
                                        <>
                                            <span>•</span>
                                            <span>{payment.beneficiary_name}</span>
                                        </>
                                    )}
                                    {payment.is_recurring && (
                                        <>
                                            <span>•</span>
                                            <span className="flex items-center gap-1 text-blue-500"><Repeat className="w-3 h-3"/> {payment.recurring_frequency}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-6 md:w-64">
                            <div className="text-left md:text-right">
                                <div className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                    {formatMoney(payment.amount)}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-navy-400">
                                    Scadent: {format(new Date(payment.due_date), 'dd MMM yyyy', { locale: ro })}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
