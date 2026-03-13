import { useEffect, useMemo, useState, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useSessionData } from '../context/SessionDataContext.jsx';
import { debugLog } from '../utils/debug.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { useTxnModules } from './useTxnModules.js';
import { cachedFetch } from '../core/apiCache.js';

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
  const txnModules = useTxnModules({ enabled: false });
  const txnSignature = useMemo(() => computeTxnSignature(txnModules), [txnModules]);
  const [modules, setModules] = useState(cache.data || []);
  const initialized = useRef({ ready: false, key: null });

  async function fetchModules(signature = txnSignature) {
    try {
      // Server returns modules already filtered by license and permission.
      let rows = await cachedFetch('/api/modules', { credentials: 'include' }, 10 * 60 * 1000);
      if (!Array.isArray(rows)) rows = [];
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
      // Lazily load report procedures when report pages/modules are opened.
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
    const effectKey = `${branch ?? ''}|${department ?? ''}|${prefix ?? ''}|${txnSignature}`;
    if (initialized.current.ready && initialized.current.key === effectKey) return;
    initialized.current = { ready: true, key: effectKey };

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
  }, [branch, department, generalConfig?.general?.reportProcPrefix, txnSignature, sessionData?.loaded, sessionData?.modules]);

  useEffect(() => {
    debugLog('useModules effect: refresh listener');
    const handler = () => fetchModules(txnSignature);
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [txnSignature]);

  return modules;
}
