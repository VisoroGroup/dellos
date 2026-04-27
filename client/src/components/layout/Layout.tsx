import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useTheme } from '../../contexts/ThemeContext';
import {
    CreditCard, BarChart3, FileText, Upload, LogOut, Menu, X, ChevronLeft,
    Mail, PieChart, Sun, Moon
} from 'lucide-react';

// `roles` matches server-side gating. `superadmin` inherits all lower roles
// on the server, so we list it explicitly here too.
// Items without a `roles` field are visible to any authenticated user.
const NAV_ITEMS: { to: string; icon: any; label: string; roles?: string[] }[] = [
    { to: '/payments', icon: CreditCard, label: 'Plăți', roles: ['superadmin', 'admin'] },
    { to: '/budget', icon: BarChart3, label: 'Budget', roles: ['superadmin'] },
    { to: '/client-invoices', icon: FileText, label: 'Facturi Client', roles: ['superadmin'] },
    { to: '/bank-import', icon: Upload, label: 'Bank Import', roles: ['superadmin'] },
    { to: '/anaf', icon: Mail, label: 'E-Facturi SPV' },
    { to: '/anaf/rapoarte', icon: PieChart, label: 'Rapoarte ANAF' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const { darkMode, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close mobile drawer on route change
    useEffect(() => { setMobileOpen(false); }, [location.pathname]);

    // Listen for session-expired event from the api interceptor
    useEffect(() => {
        const handler = () => showToast('Sesiunea a expirat, te rog autentifică-te din nou', 'error');
        window.addEventListener('app:session-expired', handler);
        return () => window.removeEventListener('app:session-expired', handler);
    }, [showToast]);

    const visibleNav = NAV_ITEMS.filter(item => !item.roles || item.roles.includes(user?.role || ''));

    const sidebarContent = (
        <>
            {/* Logo */}
            <div className="flex items-center gap-2 px-4 py-4 border-b border-navy-800/50">
                {!collapsed && <span className="text-lg font-bold text-white truncate">Financiar</span>}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="ml-auto text-navy-400 hover:text-white transition-colors hidden md:inline-flex"
                >
                    {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                </button>
                <button
                    onClick={() => setMobileOpen(false)}
                    className="ml-auto text-navy-400 hover:text-white transition-colors md:hidden"
                    aria-label="Close menu"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-3 space-y-1 px-2">
                {visibleNav.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                isActive
                                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                    : 'text-navy-300 hover:bg-navy-800/50 hover:text-white border border-transparent'
                            }`
                        }
                    >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                ))}
            </nav>

            {/* User */}
            <div className="border-t border-navy-800/50 p-3">
                {!collapsed && user && (
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400">
                            {user.display_name?.charAt(0) || '?'}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-white truncate">{user.display_name}</p>
                            <p className="text-[10px] text-navy-500 truncate">{user.email}</p>
                        </div>
                    </div>
                )}
                <button
                    onClick={toggleTheme}
                    title={darkMode ? 'Mod luminos' : 'Mod întunecat'}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-navy-400 hover:text-white rounded-lg hover:bg-navy-800/50 transition-colors mb-1"
                >
                    {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {!collapsed && (darkMode ? 'Mod luminos' : 'Mod întunecat')}
                </button>
                <button
                    onClick={() => { logout(); navigate('/'); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-navy-400 hover:text-red-400 rounded-lg hover:bg-navy-800/50 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    {!collapsed && 'Deconectare'}
                </button>
            </div>
        </>
    );

    return (
        <div className="flex h-screen bg-navy-950 text-white overflow-hidden">
            {/* Mobile top bar */}
            <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 h-12 bg-navy-900/80 backdrop-blur border-b border-navy-800/50">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="text-navy-300 hover:text-white"
                    aria-label="Open menu"
                >
                    <Menu className="w-5 h-5" />
                </button>
                <span className="text-sm font-bold text-white">Financiar</span>
                <span className="w-5" />
            </div>

            {/* Mobile backdrop */}
            {mobileOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Desktop sidebar */}
            <aside
                className={`hidden md:flex flex-shrink-0 flex-col bg-navy-900/50 border-r border-navy-800/50 transition-all duration-300 ${collapsed ? 'w-16' : 'w-56'}`}
            >
                {sidebarContent}
            </aside>

            {/* Mobile drawer sidebar */}
            <aside
                className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-navy-900 border-r border-navy-800/50 transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {sidebarContent}
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto pt-12 md:pt-0">
                {children}
            </main>
        </div>
    );
}
