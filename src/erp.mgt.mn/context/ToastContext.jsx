import React, { createContext, useCallback, useContext, useState, useEffect, useMemo } from 'react';
import { trackSetState } from '../utils/debug.js';

const ToastContext = createContext({ addToast: () => {} });

function normalizeMessage(message) {
  if (React.isValidElement(message)) return message;
  if (message instanceof Error) {
    return message.message || message.toString();
  }
  if (typeof message === 'string' || typeof message === 'number') {
    return String(message);
  }
  if (message === null || message === undefined) {
    return '';
  }
  if (typeof message === 'object') {
    try {
      const serialized = JSON.stringify(message);
      return typeof serialized === 'string' ? serialized : String(message);
    } catch {
      return String(message);
    }
  }
  return String(message);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const safeMessage = normalizeMessage(message);
    const id = Date.now() + Math.random();
    trackSetState('ToastProvider.setToasts');
    setToasts((t) => [...t, { id, message: safeMessage, type }]);
    setTimeout(() => {
      trackSetState('ToastProvider.setToasts');
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    function handle(e) {
      const { message, type } = e.detail || {};
      if (message !== undefined) addToast(message, type);
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
