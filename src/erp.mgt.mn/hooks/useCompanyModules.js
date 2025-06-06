import { useEffect, useState } from 'react';

const cache = {};
const emitter = new EventTarget();

export function refreshCompanyModules(companyId) {
  if (companyId) delete cache[companyId];
  emitter.dispatchEvent(new Event('refresh'));
}

export function useCompanyModules(companyId) {
  const [modules, setModules] = useState(null);

  async function fetchModules(id) {
    try {
      const res = await fetch(`/api/company_modules?companyId=${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      const rows = res.ok ? await res.json() : [];
      const map = {};
      rows.forEach((r) => {
        if (r.licensed) {
          map[r.module_key] = true;
        }
      });
      cache[id] = map;
      setModules(map);
    } catch (err) {
      console.error('Failed to load company modules', err);
      setModules({});
    }
  }

  useEffect(() => {
    if (!companyId) {
      setModules(null);
      return;
    }
    if (cache[companyId]) {
      setModules(cache[companyId]);
    } else {
      fetchModules(companyId);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    const handler = () => fetchModules(companyId);
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [companyId]);

  return modules;
}
