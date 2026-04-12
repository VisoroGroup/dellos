import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
    CreditCard, BarChart3, FileText, Upload, LogOut, Menu, X, ChevronLeft
} from 'lucide-react';

const NAV_ITEMS = [
    { to: '/payments', icon: CreditCard, label: 'Plăți' },
    { to: '/budget', icon: BarChart3, label: 'Budget' },
    { to: '/client-invoices', icon: FileText, label: 'Facturi Client' },
    { to: '/bank-import', icon: Upload, label: 'Bank Import' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className="flex h-screen bg-navy-950 text-white overflow-hidden">
            {/* Sidebar */}
            <aside className={`flex-shrink-0 flex flex-col bg-navy-900/50 border-r border-navy-800/50 transition-all duration-300 ${collapsed ? 'w-16' : 'w-56'}`}>
                {/* Logo */}
                <div className="flex items-center gap-2 px-4 py-4 border-b border-navy-800/50">
                    {!collapsed && <span className="text-lg font-bold text-white truncate">Financiar</span>}
                    <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-navy-400 hover:text-white transition-colors">
                        {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-3 space-y-1 px-2">
                    {NAV_ITEMS.map(item => (
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
                        onClick={() => { logout(); navigate('/'); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-navy-400 hover:text-red-400 rounded-lg hover:bg-navy-800/50 transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        {!collapsed && 'Deconectare'}
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    );
}
