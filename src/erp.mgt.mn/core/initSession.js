import { cachedFetch } from './apiCache.js';

export async function initSession(companyId = 1) {
  const [user, modules, companyModules, settings, generalConfig] = await Promise.all([
    cachedFetch('/api/auth/me'),
    cachedFetch('/api/modules'),
    cachedFetch(`/api/company_modules?companyId=${encodeURIComponent(companyId)}`),
    cachedFetch('/api/user/settings'),
    cachedFetch('/api/general_config'),
  ]);

  return {
    user,
    modules,
    companyModules,
    settings,
    generalConfig,
    initialized: true,
  };
}
