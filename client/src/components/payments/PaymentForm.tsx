import React, { useState } from 'react';
import { useCreatePayment } from '../../services/payments';
import { PAYMENT_CATEGORIES } from '../../types';
import { X, Loader2, Save } from 'lucide-react';

interface PaymentFormProps {
    onClose: () => void;
    darkMode: boolean;
}

export default function PaymentForm({ onClose, darkMode }: PaymentFormProps) {
    const { mutate: createPayment, isPending } = useCreatePayment();
    const [formData, setFormData] = useState({
        title: '',
        amount: '',
        currency: 'RON',
        category: 'furnizor_servicii' as any,
        beneficiary_name: '',
        due_date: new Date().toISOString().split('T')[0],
        is_recurring: false,
        recurring_frequency: 'monthly' as any,
        initial_comment: ''
    });

    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!formData.title || !formData.amount || !formData.due_date || !formData.category) {
            setError('Terminați de completat câmpurile obligatorii.');
            return;
        }

        createPayment(formData, {
            onSuccess: () => onClose(),
            onError: (err: any) => setError(err.response?.data?.error || 'Eroare la salvare. Reîncearcă.')
        });
    };

    const inputClasses = `w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none transition-shadow ${darkMode ? 'bg-navy-900 border-navy-700 text-white placeholder-navy-400 focus:border-blue-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'}`;
    const labelClasses = `block text-sm font-medium mb-1.5 ${darkMode ? 'text-navy-300' : 'text-gray-700'}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${darkMode ? 'bg-navy-950 border border-navy-700' : 'bg-white'}`}>
                {/* Header */}
                <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-navy-800' : 'border-gray-200'}`}>
                    <h2 className={`text-xl font-bold font-outfit ${darkMode ? 'text-white' : 'text-gray-900'}`}>Adaugă Plată Nouă</h2>
                    <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-navy-800 text-navy-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border-l-4 border-red-500 text-red-700 dark:text-red-400 rounded-r-xl text-sm font-medium">
                            {error}
                        </div>
                    )}
                    
                    <form id="payment-form" onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="md:col-span-2">
                                <label className={labelClasses}>Titlu plată / Detalii scurte *</label>
                                <input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className={inputClasses} placeholder="ex: Scaun ergonomic" />
                            </div>

                            <div>
                                <label className={labelClasses}>Suma *</label>
                                <div className="relative">
                                    <input type="number" step="0.01" required value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} className={inputClasses} placeholder="0.00" />
                                    <span className={`absolute right-4 top-1/2 -translate-y-1/2 font-medium ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>RON</span>
                                </div>
                            </div>

                            <div>
                                <label className={labelClasses}>Data Scadentă *</label>
                                <input type="date" required value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} className={inputClasses} />
                            </div>

                            <div className="md:col-span-2">
                                <label className={labelClasses}>Categorie *</label>
                                <select required value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className={inputClasses}>
                                    {Object.entries(PAYMENT_CATEGORIES).map(([key, conf]) => (
                                        <option key={key} value={key}>{conf.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className={labelClasses}>Beneficiar (Opțional)</label>
                                <input type="text" value={formData.beneficiary_name} onChange={e => setFormData({ ...formData, beneficiary_name: e.target.value })} className={inputClasses} placeholder="Către cine se face plata?" />
                            </div>

                            <div className="md:col-span-2 pt-2 border-t border-dashed border-gray-300 dark:border-navy-700">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" checked={formData.is_recurring} onChange={e => setFormData({ ...formData, is_recurring: e.target.checked })} className="peer sr-only" />
                                        <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer dark:bg-navy-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
                                    </div>
                                    <span className={`text-sm font-medium transition-colors ${formData.is_recurring ? (darkMode ? 'text-blue-400' : 'text-blue-600') : (darkMode ? 'text-navy-300' : 'text-gray-700')}`}>
                                        Plată Recurentă
                                    </span>
                                </label>
                            </div>

                            {formData.is_recurring && (
                                <div className="md:col-span-2 animate-in slide-in-from-top-2">
                                    <label className={labelClasses}>Frecvență Recurență</label>
                                    <select value={formData.recurring_frequency} onChange={e => setFormData({ ...formData, recurring_frequency: e.target.value })} className={inputClasses}>
                                        <option value="monthly">Lunar</option>
                                        <option value="quarterly">Trimestrial</option>
                                        <option value="yearly">Anual</option>
                                    </select>
                                    <p className={`mt-2 text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Această plată se va recrea automat la intervalul specificat după ce este marcată ca fiind plătită.</p>
                                </div>
                            )}

                            <div className="md:col-span-2">
                                <label className={labelClasses}>Comentariu / Detalii Adiționale (Opțional)</label>
                                <textarea rows={3} value={formData.initial_comment} onChange={e => setFormData({ ...formData, initial_comment: e.target.value })} className={inputClasses} placeholder="Orice notiță utilă..." />
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className={`px-6 py-4 border-t flex items-center justify-end gap-3 ${darkMode ? 'bg-navy-900/50 border-navy-800' : 'bg-gray-50 border-gray-200'}`}>
                    <button type="button" onClick={onClose} disabled={isPending} className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${darkMode ? 'text-navy-300 hover:bg-navy-800' : 'text-gray-600 hover:bg-gray-200'}`}>
                        Anulează
                    </button>
                    <button type="submit" form="payment-form" disabled={isPending} className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-70">
                        {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        Salvează Plata
                    </button>
                </div>
            </div>
        </div>
    );
}
