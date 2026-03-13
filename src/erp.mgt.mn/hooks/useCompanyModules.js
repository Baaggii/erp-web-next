import { invalidateQuery, useApiQuery } from './apiQueryCache.js';

export function refreshCompanyModules(companyId) {
  if (companyId != null) {
    invalidateQuery(['company_modules', Number(companyId)]);
  }
}

export function useCompanyModules(companyId) {
  const { data } = useApiQuery({
    queryKey: ['company_modules', Number(companyId)],
    enabled: companyId != null,
    staleTime: 10 * 60_000,
    cacheTime: 30 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/company_modules?companyId=${encodeURIComponent(companyId)}`, {
        credentials: 'include',
      });
      const rows = res.ok ? await res.json() : [];
      const map = {};
      rows.forEach((r) => {
        if (Number(r.company_id) === Number(companyId) && r.licensed) {
          map[r.module_key] = true;
        }
      });
      return map;
    },
  });

  return companyId == null ? null : (data || {});
}
