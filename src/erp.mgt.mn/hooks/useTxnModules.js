import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';

// Cache both the set of transaction module keys and a label map so that other
// hooks can synthesize missing module entries for non‑admin users.
const cache = {
  keys: null,
  labels: null,
  branchId: undefined,
  departmentId: undefined,
};
const emitter = new EventTarget();

export function refreshTxnModules() {
  delete cache.keys;
  delete cache.labels;
  emitter.dispatchEvent(new Event('refresh'));
}

export function useTxnModules() {
  const { branch, department } = useContext(AuthContext);
  const [state, setState] = useState({
    keys: cache.keys || new Set(),
    labels: cache.labels || {},
  });

  async function fetchKeys() {
    try {
      const params = new URLSearchParams();
      if (branch) params.set('branchId', branch);
      if (department) params.set('departmentId', department);
      const res = await fetch(
        `/api/transaction_forms${params.toString() ? `?${params.toString()}` : ''}`,
        { credentials: 'include' },
      );
      const data = res.ok ? await res.json() : {};
      const set = new Set();
      const labels = {};
      Object.values(data).forEach((info) => {
        if (info && info.moduleKey) {
          set.add(info.moduleKey);
          if (info.moduleLabel) labels[info.moduleKey] = info.moduleLabel;
        }
      });
      cache.keys = set;
      cache.labels = labels;
      cache.branchId = branch;
      cache.departmentId = department;
      setState({ keys: new Set(set), labels });
    } catch (err) {
      console.error('Failed to load transaction modules', err);
      setState({ keys: new Set(), labels: {} });
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

  return state;
}
