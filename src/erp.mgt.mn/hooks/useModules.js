import { useEffect, useState } from 'react';
import { debugLog } from '../utils/debug.js';

const cache = {
  data: null,
};
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
      let rows = res.ok ? await res.json() : [];
      if (!Array.isArray(rows)) rows = [];
      rows = rows
        .filter((m) => m && typeof m === 'object')
        .map((m) => ({
          ...m,
          module_key: m.module_key,
          parent_key: m.parent_key,
        }))
        .filter((m) => m.module_key);

      cache.data = rows;
      setModules(rows);
    } catch (err) {
      console.error('Failed to load modules', err);
      cache.data = [];
      setModules([]);
    }
  }

  useEffect(() => {
    debugLog('useModules effect: initial fetch');
    if (!cache.data) {
      fetchModules();
    } else {
      setModules(cache.data);
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
