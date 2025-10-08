import { useEffect, useMemo, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { useTxnModules } from './useTxnModules.js';

const cache = {
  data: null,
  branchId: undefined,
  departmentId: undefined,
  prefix: undefined,
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
  cache.branchId = undefined;
  cache.departmentId = undefined;
  cache.prefix = undefined;
  cache.txnSignature = undefined;
  emitter.dispatchEvent(new Event('refresh'));
}

export function useModules() {
  const { branch, department } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const txnModules = useTxnModules();
  const txnSignature = useMemo(() => computeTxnSignature(txnModules), [txnModules]);
  const [modules, setModules] = useState(cache.data || []);

  async function fetchModules(signature = txnSignature) {
    try {
      // Server returns modules already filtered by license and permission.
      const res = await fetch('/api/modules', { credentials: 'include' });
      let rows = res.ok ? await res.json() : [];
      if (!Array.isArray(rows)) rows = [];
      rows = rows.filter((m) => m && typeof m === 'object' && m.module_key);

      const txnKeys = txnModules?.keys instanceof Set ? txnModules.keys : new Set();
      const txnLabels = txnModules?.labels || {};

      if (!txnKeys.has('pos_transactions')) {
        rows = rows.filter((m) => m.module_key !== 'pos_transactions');
      }

      // Ensure dynamic transaction modules exist in the module list so users
      // without explicit module permissions still see their allowed forms.
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
      try {
        const params = new URLSearchParams();
        if (branch) params.set('branchId', branch);
        if (department) params.set('departmentId', department);
        const prefix = generalConfig?.general?.reportProcPrefix || '';
        if (prefix) params.set('prefix', prefix);
        const pres = await fetch(
          `/api/report_procedures${params.toString() ? `?${params.toString()}` : ''}`,
          { credentials: 'include' },
        );
        if (pres.ok) {
          const data = await pres.json();
          const list = Array.isArray(data.procedures)
            ? data.procedures.map((p) => (typeof p === 'string' ? p : p.name))
            : [];
          const filtered = prefix
            ? list.filter((p) =>
                p.toLowerCase().includes(prefix.toLowerCase()),
              )
            : list;
          filtered.forEach((p) => {
            const key = `proc_${p.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
            rows.push({
              module_key: key,
              label: p,
              parent_key: 'reports',
              show_in_sidebar: true,
              show_in_header: false,
            });
          });
        }
      } catch (e) {
        console.error('Failed to load procedures', e);
      }
      cache.data = rows;
      cache.branchId = branch;
      cache.departmentId = department;
      cache.prefix = generalConfig?.general?.reportProcPrefix;
      cache.txnSignature = signature;
      setModules(rows);
    } catch (err) {
      console.error('Failed to load modules', err);
      cache.data = [];
      cache.branchId = branch;
      cache.departmentId = department;
      cache.prefix = generalConfig?.general?.reportProcPrefix;
      cache.txnSignature = signature;
      setModules([]);
    }
  }

  useEffect(() => {
    debugLog('useModules effect: initial fetch');
    const prefix = generalConfig?.general?.reportProcPrefix;
    if (
      !cache.data ||
      cache.branchId !== branch ||
      cache.departmentId !== department ||
      cache.prefix !== prefix ||
      cache.txnSignature !== txnSignature
    ) {
      fetchModules(txnSignature);
    } else {
      setModules(cache.data);
    }
  }, [branch, department, generalConfig?.general?.reportProcPrefix, txnSignature]);

  useEffect(() => {
    debugLog('useModules effect: refresh listener');
    const handler = () => fetchModules(txnSignature);
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [branch, department, generalConfig?.general?.reportProcPrefix, txnSignature]);

  return modules;
}
