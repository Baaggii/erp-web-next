import { useEffect, useState } from 'react';
import { debugLog } from '../utils/debug.js';

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
      const res = await fetch('/api/modules', { credentials: 'include' });
      const rows = res.ok ? await res.json() : [];
      cache.data = rows;
      setModules(rows);
    } catch {
      // Ignore module load errors on unauthenticated pages
      setModules([]);
    }
  }

  useEffect(() => {
    debugLog('useModules effect: initial fetch');
    if (!cache.data) {
      fetchModules();
    }
  }, []);

  useEffect(() => {
    debugLog('useModules effect: refresh listener');
    const handler = () => fetchModules();
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, []);

  return modules;
}
