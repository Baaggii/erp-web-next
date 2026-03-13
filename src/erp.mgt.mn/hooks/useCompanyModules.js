import { useEffect, useState } from 'react';
import { useSessionData } from '../context/SessionDataContext.jsx';

const cache = {};
const emitter = new EventTarget();

export function refreshCompanyModules(companyId) {
  if (companyId != null) delete cache[companyId];
  emitter.dispatchEvent(new Event('refresh'));
}

export function useCompanyModules(companyId) {
  const [modules, setModules] = useState(null);
  const { sessionData } = useSessionData();

  async function fetchModules(id) {
    try {
      const rows = sessionData?.loaded && Array.isArray(sessionData.companyModules)
        ? sessionData.companyModules
        : await (async () => {
          const res = await fetch(`/api/company_modules?companyId=${encodeURIComponent(id)}`, {
            credentials: 'include',
          });
          return res.ok ? await res.json() : [];
        })();
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

  useEffect(() => {
    if (companyId == null) {
      setModules(null);
      return;
    }
    if (cache[companyId]) {
      setModules(cache[companyId]);
    } else {
      fetchModules(companyId);
    }
  }, [companyId, sessionData?.loaded, sessionData?.companyModules]);

  useEffect(() => {
    if (companyId == null) return;
    const handler = () => fetchModules(companyId);
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [companyId, sessionData?.loaded, sessionData?.companyModules]);

  return modules;
}
