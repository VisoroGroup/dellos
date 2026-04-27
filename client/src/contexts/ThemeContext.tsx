import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { safeLocalStorage } from '../utils/storage';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
    theme: Theme;
    darkMode: boolean; // convenience boolean (= theme === 'dark')
    toggleTheme: () => void;
    setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'dark-mode';

function readInitialTheme(): Theme {
    const saved = safeLocalStorage.get(STORAGE_KEY);
    if (saved === 'true') return 'dark';
    if (saved === 'false') return 'light';
    // Fall back to system preference, default dark for this app's history
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(readInitialTheme);

    // Apply class to <html> element + persist
    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        safeLocalStorage.set(STORAGE_KEY, theme === 'dark' ? 'true' : 'false');
    }, [theme]);

    const setTheme = useCallback((t: Theme) => setThemeState(t), []);
    const toggleTheme = useCallback(() => {
        setThemeState(t => (t === 'dark' ? 'light' : 'dark'));
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, darkMode: theme === 'dark', toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within a <ThemeProvider>');
    return ctx;
}
