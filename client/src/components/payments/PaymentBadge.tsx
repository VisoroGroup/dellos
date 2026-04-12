import React from 'react';
import { differenceInDays, isToday, isTomorrow } from 'date-fns';
import { AlertTriangle, Clock, CalendarDays, CheckCircle2 } from 'lucide-react';

export function getPaymentUrgency(dueDate: string, status: string) {
    if (status === 'platit') return { state: 'paid', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400', icon: CheckCircle2 };
    
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    due.setHours(0,0,0,0);
    
    const diff = differenceInDays(due, today);

    if (diff < 0) {
        return { state: 'overdue', diff: Math.abs(diff), color: 'bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]', icon: AlertTriangle };
    }
    if (isToday(due)) {
        return { state: 'today', diff: 0, color: 'bg-orange-500 text-white animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.5)]', icon: AlertTriangle };
    }
    if (isTomorrow(due)) {
        return { state: 'tomorrow', diff: 1, color: 'bg-amber-100 text-amber-500 dark:bg-amber-500/20 dark:text-amber-400', icon: Clock };
    }
    if (diff <= 7) {
        return { state: 'week', diff, color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400', icon: Clock };
    }
    
    return { state: 'safe', diff, color: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300', icon: CalendarDays };
}

export default function PaymentBadge({ dueDate, status }: { dueDate: string, status: string }) {
    const urgency = getPaymentUrgency(dueDate, status);
    const Icon = urgency.icon;

    let text = '';
    if (urgency.state === 'paid') text = 'Plătit';
    else if (urgency.state === 'overdue') text = `RESTANT! (${urgency.diff} zile)`;
    else if (urgency.state === 'today') text = 'SCADENT AZI';
    else if (urgency.state === 'tomorrow') text = 'Mâine';
    else text = `În ${urgency.diff} zile`;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${urgency.color}`}>
            <Icon className="w-3.5 h-3.5" />
            {text}
        </span>
    );
}
