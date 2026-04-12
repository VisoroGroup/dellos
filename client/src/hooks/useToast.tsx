import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X, Undo2 } from 'lucide-react';

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    undoAction?: () => void;
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info', undoAction?: () => void) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => { } });

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', undoAction?: () => void) => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type, undoAction }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, undoAction ? 6000 : 4000); // longer if undo available
    }, []);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-green-400" />,
        error: <AlertCircle className="w-5 h-5 text-red-400" />,
        info: <Info className="w-5 h-5 text-blue-400" />,
    };

    const bgColors = {
        success: 'bg-green-900/90 border-green-700',
        error: 'bg-red-900/90 border-red-700',
        info: 'bg-blue-900/90 border-blue-700',
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`toast-enter flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl text-white text-sm ${bgColors[toast.type]}`}
                    >
                        {icons[toast.type]}
                        <span>{toast.message}</span>
                        {toast.undoAction && (
                            <button
                                onClick={() => { toast.undoAction?.(); removeToast(toast.id); }}
                                className="ml-1 flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs font-medium transition-colors"
                            >
                                <Undo2 className="w-3 h-3" /> Anulează
                            </button>
                        )}
                        <button onClick={() => removeToast(toast.id)} className="ml-2 hover:opacity-70">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
