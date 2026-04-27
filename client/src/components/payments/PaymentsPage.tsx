import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { usePayments } from '../../services/payments';
import PaymentsSummary from './PaymentsSummary';
import PaymentsChart from './PaymentsChart';
import PaymentsFilterBar from './PaymentsFilterBar';
import PaymentsList from './PaymentsList';
import PaymentDrawer from './PaymentDrawer';
import PaymentForm from './PaymentForm';
import { Plus } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export default function PaymentsPage() {
    const { user } = useAuth();
    const { darkMode } = useTheme();

    const [filters, setFilters] = useState({});
    const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
    const [showPaymentForm, setShowPaymentForm] = useState(false);

    const { data: payments, isLoading } = usePayments(filters);
    
    // Protect route for admin only
    if (user?.role !== 'admin' && user?.role !== 'superadmin') {
        return <Navigate to="/" replace />;
    }

    return (
        <div className={`min-h-screen p-4 md:p-8 ${darkMode ? 'bg-navy-950 text-white' : 'bg-gray-50 text-gray-900'} transition-colors duration-300`}>
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold font-outfit tracking-tight">Modul Financiar</h1>
                        <p className={`mt-1 text-sm ${darkMode ? 'text-navy-300' : 'text-gray-500'}`}>Gestionează plățile și scadențele companiei</p>
                    </div>
                    
                    <button 
                        onClick={() => setShowPaymentForm(true)}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white shadow-lg transition-all hover:-translate-y-0.5
                            bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-blue-500/25`}>
                        <Plus className="w-5 h-5" /> Adaugă Plată
                    </button>
                </div>

                <PaymentsSummary darkMode={darkMode} />
                <PaymentsChart darkMode={darkMode} />

                <div className="mb-8">
                    <h2 className={`text-xl font-bold mb-4 font-outfit ${darkMode ? 'text-white' : 'text-gray-900'}`}>Lista Plăților</h2>
                    <PaymentsFilterBar filters={filters} setFilters={setFilters} darkMode={darkMode} />
                    <PaymentsList 
                        payments={payments || []} 
                        isLoading={isLoading} 
                        darkMode={darkMode} 
                        onPaymentClick={(id) => setSelectedPaymentId(id)}
                    />
                </div>
            </div>

            {/* Modals / Drawers */}
            {selectedPaymentId && <PaymentDrawer paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)} darkMode={darkMode} />}
            {showPaymentForm && <PaymentForm onClose={() => setShowPaymentForm(false)} darkMode={darkMode} />}
        </div>
    );
}
