import { useState, FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';

export default function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (submitting) return;
        setError(null);
        setSubmitting(true);
        try {
            await login(email.trim(), password);
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Eroare la autentificare.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="flex items-center justify-center h-screen bg-navy-950 px-4">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm bg-navy-900/60 border border-navy-700 rounded-2xl p-6 shadow-xl"
            >
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-white">Dellos</h1>
                    <p className="text-navy-400 text-sm mt-1">Visoro Global SRL</p>
                </div>

                <label className="block text-xs font-medium text-navy-300 mb-1" htmlFor="email">
                    Email
                </label>
                <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 mb-4 rounded-lg bg-navy-800 border border-navy-600 text-white text-sm focus:outline-none focus:border-blue-500"
                />

                <label className="block text-xs font-medium text-navy-300 mb-1" htmlFor="password">
                    Parolă
                </label>
                <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 mb-4 rounded-lg bg-navy-800 border border-navy-600 text-white text-sm focus:outline-none focus:border-blue-500"
                />

                {error && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={submitting || !email || !password}
                    className="w-full px-4 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm"
                >
                    {submitting ? 'Se autentifică...' : 'Autentificare'}
                </button>
            </form>
        </div>
    );
}
