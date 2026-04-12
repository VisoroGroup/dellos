import React from 'react';
import { PAYMENT_CATEGORIES } from '../../types';
import { Search, Filter, X } from 'lucide-react';

interface PaymentsFilterBarProps {
    filters: any;
    setFilters: (v: any) => void;
    darkMode: boolean;
}

export default function PaymentsFilterBar({ filters, setFilters, darkMode }: PaymentsFilterBarProps) {
    const defaultClasses = `w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow ${darkMode ? 'bg-navy-900 border-navy-700 text-white placeholder-navy-400 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`;

    return (
        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-navy-800/30 border-navy-700' : 'bg-white border-gray-200'} mb-6 flex flex-col md:flex-row gap-4 items-center shadow-sm`}>
            
            {/* Status */}
            <select 
                value={filters.status || ''} 
                onChange={e => setFilters({ ...filters, status: e.target.value })}
                className={defaultClasses}
            >
                <option value="">Toate statusurile</option>
                <option value="de_platit">De platit</option>
                <option value="platit">Platite</option>
            </select>

            {/* Perioada */}
            <select 
                value={filters.period || ''} 
                onChange={e => setFilters({ ...filters, period: e.target.value })}
                className={defaultClasses}
            >
                <option value="">Toate perioadele</option>
                <option value="luna_aceasta">Luna aceasta</option>
                <option value="luna_viitoare">Luna viitoare</option>
                <option value="depasite">Doar restanțe</option>
            </select>

            {/* Recurenta */}
            <select 
                value={filters.recurring || ''} 
                onChange={e => setFilters({ ...filters, recurring: e.target.value })}
                className={defaultClasses}
            >
                <option value="">Recurență (Toate)</option>
                <option value="true">Doar recurente</option>
                <option value="false">Unice</option>
            </select>

            <button 
                onClick={() => setFilters({})}
                className={`p-2 rounded-lg border ${darkMode ? 'border-navy-600 hover:bg-navy-700 text-navy-300' : 'border-gray-200 hover:bg-gray-100 text-gray-500'} transition-colors`}
                title="Resetează filtrele"
            >
                <X className="w-5 h-5" />
            </button>
        </div>
    );
}
