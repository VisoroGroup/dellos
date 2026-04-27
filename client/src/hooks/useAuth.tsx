import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';
import axios from 'axios';
import { safeLocalStorage } from '../utils/storage';

interface AuthContextType {
    user: User | null;
    users: User[];
    loading: boolean;
    login: () => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    users: [],
    loading: true,
    login: async () => { },
    logout: () => { },
    refreshUser: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Handle OAuth callback — exchange one-time code for JWT token
        const params = new URLSearchParams(window.location.search);
        const oauthCode = params.get('code');
        const oauthError = params.get('error');

        if (oauthCode) {
            // Clean URL immediately so code isn't visible in browser history
            window.history.replaceState({}, '', '/');
            // Exchange the one-time code for a JWT token
            axios.post('/api/auth/exchange', { code: oauthCode })
                .then(({ data }) => {
                    safeLocalStorage.set('financiar_token', data.token);
                    checkAuth();
                })
                .catch((err) => {
                    console.error('Auth code exchange failed:', err);
                    setLoading(false);
                });
        } else if (oauthError) {
            console.error('OAuth error:', oauthError);
            if (oauthError === 'user_deactivated') {
                alert('Contul tău a fost dezactivat. Contactează administratorul.');
            }
            window.history.replaceState({}, '', '/');
            setLoading(false);
        } else {
            checkAuth();
        }
    }, []);

    async function checkAuth() {
        try {
            // Always try /api/auth/me — backend may have DEV_AUTH_BYPASS active
            // (in that case it returns the first user without needing a token).
            const { user } = await authApi.me();
            setUser(user);
            const allUsers = await authApi.users();
            setUsers(allUsers);
        } catch {
            safeLocalStorage.remove('financiar_token');
        } finally {
            setLoading(false);
        }
    }

    async function login() {
        window.location.href = '/api/auth/microsoft';
    }

    function logout() {
        safeLocalStorage.remove('financiar_token');
        setUser(null);
        setUsers([]);
    }

    async function refreshUser() {
        try {
            const { user } = await authApi.me();
            setUser(user);
        } catch {}
    }

    return (
        <AuthContext.Provider value={{ user, users, loading, login, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
