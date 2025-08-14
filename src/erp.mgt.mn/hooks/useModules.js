import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

const cache = { data: null, branchId: undefined, departmentId: undefined, prefix: undefined };
const emitter = new EventTarget();

export function refreshModules() {
  delete cache.data;
  emitter.dispatchEvent(new Event('refresh'));
}

export function useModules() {
  const { branch, department } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const [modules, setModules] = useState(cache.data || []);

  async function fetchModules() {
    try {
      const res = await fetch('/api/modules', { credentials: 'include' });
      const rows = res.ok ? await res.json() : [];
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
          const list = Array.isArray(data.procedures) ? data.procedures : [];
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
      setModules(rows);
    } catch (err) {
      console.error('Failed to load modules', err);
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
      cache.prefix !== prefix
    ) {
      fetchModules();
    }
  }, [branch, department, generalConfig?.general?.reportProcPrefix]);

  useEffect(() => {
    debugLog('useModules effect: refresh listener');
    const handler = () => fetchModules();
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [branch, department, generalConfig?.general?.reportProcPrefix]);

  return modules;
}
