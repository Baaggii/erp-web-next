import { useEffect, useState } from 'react';
import { debugLog } from '../utils/debug.js';

const cache = { keys: null };
const emitter = new EventTarget();

export function refreshTxnModules() {
  delete cache.keys;
  emitter.dispatchEvent(new Event('refresh'));
}

export function useTxnModules() {
  const [keys, setKeys] = useState(cache.keys || new Set());

  async function fetchKeys() {
    try {
      const res = await fetch('/api/transaction_forms', { credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      const set = new Set();
      Object.values(data).forEach((info) => {
        if (info && info.moduleKey) set.add(info.moduleKey);
      });
      cache.keys = set;
      setKeys(new Set(set));
    } catch {
      // Ignore transaction-module load errors on unauthenticated pages
      setKeys(new Set());
    }
  }

  useEffect(() => {
    debugLog('useTxnModules effect: initial fetch');
    if (!cache.keys) fetchKeys();
  }, []);

  useEffect(() => {
    debugLog('useTxnModules effect: refresh listener');
    const handler = () => fetchKeys();
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, []);

  return keys;
}
