import React, { createContext, useCallback, useContext, useState, useEffect, useMemo } from 'react';
import { trackSetState } from '../utils/debug.js';

const ToastContext = createContext({ addToast: () => {} });

function normalizeToastMessage(message) {
  if (typeof message === 'string') return message;
  if (message == null) return '';
  if (typeof message === 'number' || typeof message === 'boolean') return String(message);
  if (message instanceof Error) {
    return message.message || 'Unexpected error';
  }
  if (typeof message === 'object') {
    const objectMessage = message.message || message.error || message.code;
    if (typeof objectMessage === 'string' && objectMessage.trim()) return objectMessage;
    try {
      return JSON.stringify(message);
    } catch (err) {
      return 'Unexpected error';
    }
  }
  return String(message);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const normalizedMessage = normalizeToastMessage(message);
    if (!normalizedMessage) return;
    const id = Date.now() + Math.random();
    trackSetState('ToastProvider.setToasts');
    setToasts((t) => [...t, { id, message: normalizedMessage, type }]);
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
