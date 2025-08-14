import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';

const cache = { keys: null, branchId: undefined, departmentId: undefined };
const emitter = new EventTarget();

export function refreshTxnModules() {
  delete cache.keys;
  emitter.dispatchEvent(new Event('refresh'));
}

export function useTxnModules() {
  const { branch, department } = useContext(AuthContext);
  const [keys, setKeys] = useState(cache.keys || new Set());

  async function fetchKeys() {
    try {
      const params = new URLSearchParams();
      if (branch !== undefined)
        params.set('branchId', branch);
      if (department !== undefined)
        params.set('departmentId', department);
      const res = await fetch(
        `/api/transaction_forms${params.toString() ? `?${params.toString()}` : ''}`,
        { credentials: 'include' },
      );
      const data = res.ok ? await res.json() : {};
      const set = new Set();
      Object.values(data).forEach((info) => {
        if (info && info.moduleKey) set.add(info.moduleKey);
      });
      cache.keys = set;
      cache.branchId = branch;
      cache.departmentId = department;
      setKeys(new Set(set));
    } catch (err) {
      console.error('Failed to load transaction modules', err);
      setKeys(new Set());
    }
  }

  useEffect(() => {
    debugLog('useTxnModules effect: initial fetch');
    if (
      !cache.keys ||
      cache.branchId !== branch ||
      cache.departmentId !== department
    ) {
      fetchKeys();
    }
  }, [branch, department]);

  useEffect(() => {
    debugLog('useTxnModules effect: refresh listener');
    const handler = () => fetchKeys();
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [branch, department]);

  return keys;
}
