import React, { createContext, useCallback, useContext, useState, useEffect, useMemo } from 'react';
import { trackSetState } from '../utils/debug.js';

const DEFAULT_TOAST_TYPE = 'info';
const TOAST_ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

function normalizeToastType(type) {
  const normalized = (type || DEFAULT_TOAST_TYPE).toString().toLowerCase();
  if (normalized === 'warn' || normalized === 'warning') return 'warning';
  if (normalized === 'success' || normalized === 'error' || normalized === 'info' || normalized === 'warning') {
    return normalized;
  }
  return DEFAULT_TOAST_TYPE;
}

const ToastContext = createContext({ addToast: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = DEFAULT_TOAST_TYPE) => {
    const id = Date.now() + Math.random();
    const normalizedType = normalizeToastType(type);
    trackSetState('ToastProvider.setToasts');
    setToasts((t) => [...t, { id, message, type: normalizedType }]);
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
        {toasts.map((t) => {
          const icon = TOAST_ICONS[t.type] || TOAST_ICONS[DEFAULT_TOAST_TYPE];
          return (
            <div key={t.id} className={`toast toast-${t.type}`}>
              {icon} {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export default ToastContext;
