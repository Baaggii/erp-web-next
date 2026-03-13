import { useEffect, useMemo, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';
import { useTxnModules } from './useTxnModules.js';
import { getOrFetchQuery, invalidateQueryCache } from '../utils/queryCache.js';

const cache = {
  data: null,
  txnSignature: undefined,
};
const emitter = new EventTarget();

function computeTxnSignature(txnModules) {
  const keys = txnModules?.keys instanceof Set ? Array.from(txnModules.keys) : [];
  keys.sort();
  return keys
    .map((key) => `${key}:${txnModules?.labels?.[key] || ''}`)
    .join('|');
}

export function refreshModules() {
  delete cache.data;
  cache.txnSignature = undefined;
  invalidateQueryCache('modules');
  emitter.dispatchEvent(new Event('refresh'));
}

export function useModules() {
  const { branch, department } = useContext(AuthContext);
  const txnModules = useTxnModules();
  const txnSignature = useMemo(() => computeTxnSignature(txnModules), [txnModules]);
  const [modules, setModules] = useState(cache.data || []);

  async function fetchModules(signature = txnSignature) {
    try {
      // Server returns modules already filtered by license and permission.
      const rowsRaw = await getOrFetchQuery('modules', async () => {
        const res = await fetch('/api/modules', { credentials: 'include' });
        return res.ok ? res.json() : [];
      });
      let rows = Array.isArray(rowsRaw) ? rowsRaw : [];
      rows = rows
        .filter((m) => m && typeof m === 'object')
        .map((m) => {
          const moduleKey = m.module_key ?? m.moduleKey ?? m.modulekey;
          const parentKey = m.parent_key ?? m.parentKey ?? m.parentkey;
          return {
            ...m,
            module_key: moduleKey,
            parent_key: parentKey,
          };
        })
        .filter((m) => m.module_key);

      const txnKeys = txnModules?.keys instanceof Set ? txnModules.keys : new Set();
      const txnLabels = txnModules?.labels || {};

      if (!txnKeys.has('pos_transactions')) {
        rows = rows.filter((m) => m.module_key !== 'pos_transactions');
      }

      txnKeys.forEach((key) => {
        if (!rows.some((m) => m.module_key === key)) {
          rows.push({
            module_key: key,
            label: txnLabels[key] || key,
            parent_key: 'forms',
            show_in_sidebar: true,
            show_in_header: true,
          });
        }
      });
      if (!rows.some((m) => m.module_key === 'user_settings')) {
        rows.push({
          module_key: 'user_settings',
          label: 'User Settings',
          parent_key: 'settings',
          show_in_sidebar: true,
          show_in_header: true,
        });
      }
      if (!rows.some((m) => m.module_key === 'report_access')) {
        rows.push({
          module_key: 'report_access',
          label: 'Report Access',
          parent_key: 'report_management',
          show_in_sidebar: true,
          show_in_header: false,
        });
      }

      cache.data = rows;
      cache.txnSignature = signature;
      setModules(rows);
    } catch (err) {
      console.error('Failed to load modules', err);
      cache.data = [];
      cache.txnSignature = signature;
      setModules([]);
    }
  }

  useEffect(() => {
    debugLog('useModules effect: initial fetch');
    if (!cache.data || cache.txnSignature !== txnSignature) {
      fetchModules(txnSignature);
    } else {
      setModules(cache.data);
    }
  }, [branch, department, txnSignature]);

  useEffect(() => {
    debugLog('useModules effect: refresh listener');
    const handler = () => fetchModules(txnSignature);
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [branch, department, txnSignature]);

  return modules;
}
