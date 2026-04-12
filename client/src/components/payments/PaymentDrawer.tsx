import React, { useState } from 'react';
import { usePayment, useMarkPaymentPaid, usePaymentComments, usePaymentActivity, useCreatePaymentComment } from '../../services/payments';
import { PAYMENT_CATEGORIES } from '../../types';
import { X, CheckCircle2, MessageSquare, Activity, Send, Loader2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import PaymentBadge from './PaymentBadge';

interface PaymentDrawerProps {
    paymentId: string;
    onClose: () => void;
    darkMode: boolean;
}

export default function PaymentDrawer({ paymentId, onClose, darkMode }: PaymentDrawerProps) {
    const { data: payment, isLoading } = usePayment(paymentId);
    const { mutate: markPaid, isPending: markingPaid } = useMarkPaymentPaid();
    const { data: comments } = usePaymentComments(paymentId);
    const { data: activity } = usePaymentActivity(paymentId);
    const { mutate: addComment, isPending: addingComment } = useCreatePaymentComment();

    const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'activity'>('details');
    const [newComment, setNewComment] = useState('');
    const [confirmingPaid, setConfirmingPaid] = useState(false);

    if (isLoading || !payment) {
        return (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end">
                <div className={`w-full max-w-md h-full shadow-2xl animate-in slide-in-from-right flex items-center justify-center ${darkMode ? 'bg-navy-950' : 'bg-white'}`}>
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
            </div>
        );
    }

    const formatMoney = (val: number | string) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(parseFloat(val as string));

    const handleMarkPaid = () => {
        markPaid(paymentId, { onSuccess: onClose });
    };

    const handleCommentSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        addComment({ paymentId, content: newComment.trim() }, { onSuccess: () => setNewComment('') });
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end">
            <div className={`w-full max-w-md h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ${darkMode ? 'bg-navy-950 text-white' : 'bg-white text-gray-900'}`}>
                {/* Header */}
                <div className={`px-6 py-5 border-b flex items-center justify-between ${darkMode ? 'border-navy-800' : 'border-gray-200'}`}>
                    <div>
                        <h2 className="text-sm font-bold text-gray-400 dark:text-navy-400 uppercase tracking-widest mb-1">Detalii Plată</h2>
                        <h3 className="text-xl font-bold">{payment.title}</h3>
                    </div>
                    <button onClick={onClose} className={`p-2 inset-y-0 rounded-lg transition-colors ${darkMode ? 'hover:bg-navy-800 text-navy-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className={`flex border-b text-sm font-medium ${darkMode ? 'border-navy-800' : 'border-gray-200'}`}>
                    <button onClick={() => setActiveTab('details')} className={`flex-1 py-3 text-center border-b-2 transition-colors ${activeTab === 'details' ? 'border-blue-500 text-blue-500' : `border-transparent ${darkMode ? 'text-navy-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}`}>Detalii Generale</button>
                    <button onClick={() => setActiveTab('comments')} className={`flex-1 py-3 text-center border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'comments' ? 'border-blue-500 text-blue-500' : `border-transparent ${darkMode ? 'text-navy-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}`}><MessageSquare className="w-4 h-4" /> Comentarii</button>
                    <button onClick={() => setActiveTab('activity')} className={`flex-1 py-3 text-center border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'activity' ? 'border-blue-500 text-blue-500' : `border-transparent ${darkMode ? 'text-navy-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}`}><Activity className="w-4 h-4" /> Activitate</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <div className={`p-5 rounded-2xl flex flex-col items-center justify-center text-center shadow-inner ${darkMode ? 'bg-navy-900/50' : 'bg-gray-50'}`}>
                                <h1 className="text-4xl font-black mb-2 font-outfit text-blue-500">{formatMoney(payment.amount)}</h1>
                                <PaymentBadge dueDate={payment.due_date} status={payment.status} />
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <p className={`text-xs uppercase tracking-wider font-bold mb-1 ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>Categorie & Beneficiar</p>
                                    <p className="font-medium">{PAYMENT_CATEGORIES[payment.category as keyof typeof PAYMENT_CATEGORIES]?.label}</p>
                                    {payment.beneficiary_name && <p className="text-sm mt-0.5">{payment.beneficiary_name}</p>}
                                </div>
                                <hr className={darkMode ? 'border-navy-800' : 'border-gray-200'}/>
                                <div>
                                    <p className={`text-xs uppercase tracking-wider font-bold mb-1 ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>Scadență & Informații</p>
                                    <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-500"/> Scadent pe: <strong className={darkMode ? 'text-white' : 'text-black'}>{format(new Date(payment.due_date), 'dd MMM yyyy', { locale: ro })}</strong></p>
                                    {payment.is_recurring && <p className="text-sm mt-1 text-blue-500 font-medium">🔁 Plată recurentă ({payment.recurring_frequency})</p>}
                                </div>
                                <hr className={darkMode ? 'border-navy-800' : 'border-gray-200'}/>
                                <div>
                                    <p className={`text-xs uppercase tracking-wider font-bold mb-1 ${darkMode ? 'text-navy-400' : 'text-gray-500'}`}>Status</p>
                                    {payment.status === 'platit' ? (
                                        <p className="text-emerald-500 font-bold flex items-center gap-2"><CheckCircle2 className="w-5 h-5"/> PLATIT pe {payment.paid_at ? format(new Date(payment.paid_at), 'dd MMM yyyy', { locale: ro }) : ''}</p>
                                    ) : (
                                        <p className="text-red-500 font-bold">DE PLATIT</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'comments' && (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 space-y-4 overflow-y-auto pb-4">
                                {comments?.map(c => (
                                    <div key={c.id} className={`p-4 rounded-xl ${darkMode ? 'bg-navy-900/40' : 'bg-gray-50'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                                {c.author_avatar ? <img src={c.author_avatar} className="w-full h-full rounded-full" /> : c.author_name?.charAt(0)}
                                            </div>
                                            <span className="font-bold text-sm">{c.author_name}</span>
                                            <span className="text-xs text-gray-500 dark:text-navy-400 ml-auto">{format(new Date(c.created_at), 'dd MMM yyyy HH:mm', { locale: ro })}</span>
                                        </div>
                                        <p className="text-sm">{c.content}</p>
                                    </div>
                                ))}
                                {(!comments || comments.length === 0) && <p className="text-center text-gray-500 dark:text-navy-400 italic mt-10">Nu sunt comentarii încă.</p>}
                            </div>
                            <form onSubmit={handleCommentSubmit} className="mt-4 flex gap-2">
                                <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Adaugă un comentariu..." className={`flex-1 p-3 rounded-xl border text-sm ${darkMode ? 'bg-navy-900 border-navy-700 placeholder-navy-500' : 'bg-white placeholder-gray-400'}`} />
                                <button type="submit" disabled={addingComment || !newComment.trim()} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"><Send className="w-5 h-5"/></button>
                            </form>
                        </div>
                    )}

                    {activeTab === 'activity' && (
                        <div className="space-y-6">
                            {activity?.map((a, idx) => (
                                <div key={a.id} className="relative pl-6">
                                    {idx !== activity.length - 1 && <div className={`absolute left-2.5 top-6 bottom-[-24px] w-px ${darkMode ? 'bg-navy-800' : 'bg-gray-200'}`}></div>}
                                    <div className="absolute left-1.5 top-1.5 w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>
                                    <p className="text-xs text-gray-500 dark:text-navy-400 mb-1">{format(new Date(a.created_at), 'dd MMM yyyy HH:mm', { locale: ro })}</p>
                                    <div className={`p-3 rounded-lg text-sm border ${darkMode ? 'bg-navy-900/30 border-navy-800 text-gray-300' : 'bg-white border-gray-100'}`}>
                                        Ați <strong>{a.action_type === 'created' ? 'creat plata' : a.action_type === 'marked_paid' ? 'marcat ca plătit' : a.action_type}</strong>
                                    </div>
                                </div>
                            ))}
                            {(!activity || activity.length === 0) && <p className="text-center text-gray-500 dark:text-navy-400 italic">Nu a fost înregistrată activitate.</p>}
                        </div>
                    )}
                </div>

                {/* Footer / Actions */}
                {payment.status === 'de_platit' && (
                    <div className={`p-6 border-t ${darkMode ? 'border-navy-800 bg-navy-950' : 'border-gray-200 bg-white'}`}>
                        {confirmingPaid ? (
                            <div className="flex items-center gap-3">
                                <span className={`text-sm font-bold flex-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>Sigur dorești să marchezi ca plătit?</span>
                                <button 
                                    onClick={handleMarkPaid} 
                                    disabled={markingPaid}
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/30">
                                    {markingPaid ? <Loader2 className="w-5 h-5 animate-spin"/> : <CheckCircle2 className="w-5 h-5"/>}
                                    Da
                                </button>
                                <button 
                                    onClick={() => setConfirmingPaid(false)} 
                                    className={`px-6 py-3 rounded-xl font-bold transition-colors ${darkMode ? 'text-navy-300 hover:bg-navy-800' : 'text-gray-600 hover:bg-gray-200'}`}>
                                    Nu
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setConfirmingPaid(true)} 
                                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-wider text-white transition-all shadow-lg hover:-translate-y-1 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 shadow-emerald-500/30">
                                <CheckCircle2 className="w-6 h-6"/>
                                Marchează ca Plătit
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
