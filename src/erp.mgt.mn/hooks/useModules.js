import { useEffect, useState } from 'react';

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
      if (!res.ok) {
        cache.data = null;
        setModules([]);
        return;
      }
      const rows = await res.json();
      cache.data = rows;
      setModules(rows);
    } catch (err) {
      console.error('Failed to load modules', err);
      cache.data = null;
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
