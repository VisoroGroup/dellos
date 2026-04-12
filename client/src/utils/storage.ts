/**
 * Safe localStorage wrapper.
 * Handles private browsing, disabled storage, and quota errors gracefully.
 */
export const safeLocalStorage = {
    get(key: string, defaultValue: string | null = null): string | null {
        try {
            return localStorage.getItem(key) ?? defaultValue;
        } catch {
            return defaultValue;
        }
    },

    set(key: string, value: string): void {
        try {
            localStorage.setItem(key, value);
        } catch {
            // Silently fail — private browsing or quota exceeded
        }
    },

    remove(key: string): void {
        try {
            localStorage.removeItem(key);
        } catch {
            // Silently fail
        }
    },
};
