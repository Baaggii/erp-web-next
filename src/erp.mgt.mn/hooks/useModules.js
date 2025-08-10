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
  const { company } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const [modules, setModules] = useState(cache.data || []);

  async function fetchModules() {
    try {
      const res = await fetch('/api/modules', { credentials: 'include' });
      const rows = res.ok ? await res.json() : [];
      try {
        const params = new URLSearchParams();
        if (company?.branch_id !== undefined)
          params.set('branchId', company.branch_id);
        if (company?.department_id !== undefined)
          params.set('departmentId', company.department_id);
        const pres = await fetch(
          `/api/report_procedures${params.toString() ? `?${params.toString()}` : ''}`,
          { credentials: 'include' },
        );
        if (pres.ok) {
          const data = await pres.json();
          const list = Array.isArray(data.procedures) ? data.procedures : [];
          const prefix = generalConfig?.general?.reportProcPrefix || '';
          const filtered = prefix
            ? list.filter((p) => p.includes(prefix))
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
      cache.branchId = company?.branch_id;
      cache.departmentId = company?.department_id;
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
      cache.branchId !== company?.branch_id ||
      cache.departmentId !== company?.department_id ||
      cache.prefix !== prefix
    ) {
      fetchModules();
    }
  }, [company?.branch_id, company?.department_id, generalConfig]);

  useEffect(() => {
    debugLog('useModules effect: refresh listener');
    const handler = () => fetchModules();
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [company?.branch_id, company?.department_id, generalConfig]);

  return modules;
}
