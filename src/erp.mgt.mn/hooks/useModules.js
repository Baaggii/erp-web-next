import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';

const cache = { data: null, branchId: undefined, departmentId: undefined };
const emitter = new EventTarget();

export function refreshModules() {
  delete cache.data;
  emitter.dispatchEvent(new Event('refresh'));
}

export function useModules() {
  const { company } = useContext(AuthContext);
  const [modules, setModules] = useState(cache.data || []);

  async function fetchModules() {
    try {
      const res = await fetch('/api/modules', { credentials: 'include' });
      const rows = res.ok ? await res.json() : [];
      cache.data = rows;
      cache.branchId = company?.branch_id;
      cache.departmentId = company?.department_id;
      setModules(rows);
    } catch (err) {
      console.error('Failed to load modules', err);
      setModules([]);
    }
  }

  useEffect(() => {
    debugLog('useModules effect: initial fetch');
    if (
      !cache.data ||
      cache.branchId !== company?.branch_id ||
      cache.departmentId !== company?.department_id
    ) {
      fetchModules();
    }
  }, [company?.branch_id, company?.department_id]);

  useEffect(() => {
    debugLog('useModules effect: refresh listener');
    const handler = () => fetchModules();
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [company?.branch_id, company?.department_id]);

  return modules;
}
