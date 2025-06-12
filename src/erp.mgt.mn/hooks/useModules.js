import { useEffect, useState } from 'react';
import { API_BASE } from '../utils/apiBase.js';

const cache = { data: null };
const emitter = new EventTarget();

export function refreshModules() {
  delete cache.data;
  emitter.dispatchEvent(new Event('refresh'));
}

export function useModules() {
  const [modules, setModules] = useState(cache.data || []);

  async function fetchModules() {
    try {
      const res = await fetch(`${API_BASE}/modules`, { credentials: 'include' });
      const rows = res.ok ? await res.json() : [];
      const filtered = rows.filter((m) => m.module_key !== 'error_log');
      cache.data = filtered;
      setModules(filtered);
    } catch (err) {
      console.error('Failed to load modules', err);
      setModules([]);
    }
  }

  useEffect(() => {
    if (!cache.data) {
      fetchModules();
    }
  }, []);

  useEffect(() => {
    const handler = () => fetchModules();
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, []);

  return modules;
}
