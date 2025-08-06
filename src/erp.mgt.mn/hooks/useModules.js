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
      try {
        const pres = await fetch('/api/procedures', { credentials: 'include' });
        if (pres.ok) {
          const data = await pres.json();
          const list = Array.isArray(data.procedures) ? data.procedures : [];
          list.forEach((p) => {
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
      setModules(rows);
    } catch (err) {
      console.error('Failed to load modules', err);
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
