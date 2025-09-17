import React, { createContext, useCallback, useContext, useState, useEffect, useMemo } from 'react';
import { trackSetState } from '../utils/debug.js';

const ToastContext = createContext({ addToast: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    trackSetState('ToastProvider.setToasts');
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      trackSetState('ToastProvider.setToasts');
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    function handle(e) {
      const { message, type } = e.detail || {};
      if (message) addToast(message, type);
    }
    window.addEventListener('toast', handle);
    return () => window.removeEventListener('toast', handle);
  }, [addToast]);

  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'} {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export default ToastContext;
