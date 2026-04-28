import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/layout/Layout';
import PaymentsPage from './components/payments/PaymentsPage';
import BudgetPlanningPage from './components/budget/BudgetPlanningPage';
import ClientInvoicesPage from './components/budget/ClientInvoicesPage';
import BankImportPage from './components/budget/BankImportPage';
import EFacturiPage from './components/anaf/EFacturiPage';
import EFacturaDetailPage from './components/anaf/EFacturaDetailPage';
import RapoartePage from './components/anaf/RapoartePage';
import LoginPage from './components/auth/LoginPage';

const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="flex items-center justify-center h-screen bg-navy-950"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>;
    if (!user) return <Navigate to="/" replace />;
    return <>{children}</>;
}

function AppRoutes() {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-navy-950"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>;
    }

    if (!user) {
        return <LoginPage />;
    }

    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Navigate to="/payments" replace />} />
                <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
                <Route path="/budget" element={<ProtectedRoute><BudgetPlanningPage /></ProtectedRoute>} />
                <Route path="/client-invoices" element={<ProtectedRoute><ClientInvoicesPage /></ProtectedRoute>} />
                <Route path="/bank-import" element={<ProtectedRoute><BankImportPage /></ProtectedRoute>} />
                <Route path="/anaf" element={<ProtectedRoute><EFacturiPage /></ProtectedRoute>} />
                <Route path="/anaf/rapoarte" element={<ProtectedRoute><RapoartePage /></ProtectedRoute>} />
                <Route path="/anaf/:id" element={<ProtectedRoute><EFacturaDetailPage /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/payments" replace />} />
            </Routes>
        </Layout>
    );
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <BrowserRouter>
                    <AuthProvider>
                        <ToastProvider>
                            <AppRoutes />
                        </ToastProvider>
                    </AuthProvider>
                </BrowserRouter>
            </ThemeProvider>
        </QueryClientProvider>
    );
}
