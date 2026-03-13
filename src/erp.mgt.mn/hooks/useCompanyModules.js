import { useEffect, useRef, useState } from 'react';
import { cachedFetch } from '../core/apiCache.js';

const cache = {};
const emitter = new EventTarget();

export function refreshCompanyModules(companyId) {
  if (companyId != null) delete cache[companyId];
  emitter.dispatchEvent(new Event('refresh'));
}

export function useCompanyModules(companyId) {
  const [modules, setModules] = useState(null);

  async function fetchModules(id) {
    try {
      const rows = await cachedFetch(`/api/company_modules?companyId=${encodeURIComponent(id)}`);
      const map = {};
      rows.forEach((r) => {
        if (Number(r.company_id) === Number(id) && r.licensed) {
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

  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current && companyId != null && cache[companyId]) {
      setModules(cache[companyId]);
      return;
    }
    loaded.current = true;
    if (companyId == null) {
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
    if (companyId == null) return;
    const handler = () => fetchModules(companyId);
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [companyId]);

  return modules;
}
