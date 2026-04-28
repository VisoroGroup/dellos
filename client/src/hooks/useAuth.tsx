import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import api, { authApi } from '../services/api';
import { safeLocalStorage } from '../utils/storage';

interface AuthContextType {
    user: User | null;
    users: User[];
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
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
        checkAuth();
    }, []);

    async function checkAuth() {
        try {
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

    async function login(email: string, password: string) {
        const { data } = await api.post('/auth/login', { email, password });
        safeLocalStorage.set('financiar_token', data.token);
        setUser(data.user);
        try {
            const allUsers = await authApi.users();
            setUsers(allUsers);
        } catch {
            // ignore — user list is non-critical
        }
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
